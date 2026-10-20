import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

describe('Security & Authentication Tests', () => {
  let authGuard: AuthGuard;
  let adminGuard: AdminGuard;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sessions: {
        findUnique: jest.fn(),
      },
      site_settings: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    authGuard = new AuthGuard(prisma);
    adminGuard = new AdminGuard(prisma);
  });

  const createMockContext = (headers: Record<string, string>): ExecutionContext => {
    const request = {
      headers,
      user: null as any,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as any;
  };

  describe('AuthGuard (Authentication & Token Validation)', () => {
    it('throws 401 UnauthorizedException if session token is missing', async () => {
      const context = createMockContext({});
      await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 UnauthorizedException if token is expired', async () => {
      const context = createMockContext({ authorization: 'Bearer expired-token' });
      prisma.sessions.findUnique.mockResolvedValue({
        token: 'expired-token',
        expires_at: new Date(Date.now() - 3600000), // 1 hour ago
        customer: { id: 'cust-1', role: 'CUSTOMER', is_blocked: false },
      });

      await expect(authGuard.canActivate(context)).rejects.toThrow('Invalid or expired session');
    });

    it('throws 401 UnauthorizedException if customer account is blocked by admin', async () => {
      const context = createMockContext({ authorization: 'Bearer blocked-token' });
      prisma.sessions.findUnique.mockResolvedValue({
        token: 'blocked-token',
        expires_at: new Date(Date.now() + 3600000),
        customer: { id: 'cust-2', role: 'CUSTOMER', is_blocked: true },
      });

      await expect(authGuard.canActivate(context)).rejects.toThrow(
        'Your account has been blocked by the administrator',
      );
    });

    it('allows access and attaches customer to request when token is valid', async () => {
      const context = createMockContext({ authorization: 'Bearer valid-token' });
      const mockCustomer = { id: 'cust-3', email: 'user@example.com', role: 'CUSTOMER', is_blocked: false };
      prisma.sessions.findUnique.mockResolvedValue({
        token: 'valid-token',
        expires_at: new Date(Date.now() + 3600000),
        customer: mockCustomer,
      });

      const allowed = await authGuard.canActivate(context);
      expect(allowed).toBe(true);
      const req = context.switchToHttp().getRequest();
      expect(req.user).toEqual(mockCustomer);
    });
  });

  describe('AdminGuard (Role-Based Access Control)', () => {
    it('blocks regular CUSTOMER from accessing admin routes', async () => {
      const context = createMockContext({ authorization: 'Bearer customer-token' });
      prisma.sessions.findUnique.mockResolvedValue({
        token: 'customer-token',
        expires_at: new Date(Date.now() + 3600000),
        customer: { id: 'cust-4', role: 'CUSTOMER', is_blocked: false },
      });

      await expect(adminGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('grants access to users with ADMIN role', async () => {
      const context = createMockContext({ authorization: 'Bearer admin-token' });
      prisma.sessions.findUnique.mockResolvedValue({
        token: 'admin-token',
        expires_at: new Date(Date.now() + 3600000),
        customer: { id: 'admin-1', role: 'ADMIN', is_blocked: false },
      });

      const allowed = await adminGuard.canActivate(context);
      expect(allowed).toBe(true);
    });

    it('grants access to users with SUPER_ADMIN role', async () => {
      const context = createMockContext({ authorization: 'Bearer superadmin-token' });
      prisma.sessions.findUnique.mockResolvedValue({
        token: 'superadmin-token',
        expires_at: new Date(Date.now() + 3600000),
        customer: { id: 'admin-2', role: 'SUPER_ADMIN', is_blocked: false },
      });

      const allowed = await adminGuard.canActivate(context);
      expect(allowed).toBe(true);
    });
  });
});
