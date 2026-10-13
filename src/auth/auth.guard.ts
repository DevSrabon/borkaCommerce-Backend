import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Session token is missing');
    }

    const session = await this.prisma.sessions.findUnique({
      where: { token },
      include: { customer: true },
    });

    if (!session || new Date(session.expires_at) < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (session.customer?.is_blocked) {
      throw new UnauthorizedException('Your account has been blocked by the administrator');
    }

    request.user = session.customer;
    return true;
  }

  private extractToken(request: any): string | null {
    // 1. Authorization Header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 2. Cookie Header
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, c) => {
        const parts = c.trim().split('=');
        const key = parts[0];
        const val = parts.slice(1).join('='); // handle values that contain '='
        if (key && val) acc[key] = decodeURIComponent(val);
        return acc;
      }, {} as Record<string, string>);

      return (
        cookies['better-auth.session_token'] ||
        cookies['__secure-better-auth.session_token'] ||
        cookies['session_token'] ||
        null
      );
    }

    return null;
  }
}
