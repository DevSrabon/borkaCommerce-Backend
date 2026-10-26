import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthGuard } from './auth.guard';

export const HARDCODED_SUPER_ADMIN_EMAILS = [
  'et.srabon@gmail.com'
];

export function isSuperAdminUser(user: any): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  const userEmail = (user.email || '').trim().toLowerCase();
  return HARDCODED_SUPER_ADMIN_EMAILS.includes(userEmail);
}

@Injectable()
export class AdminGuard extends AuthGuard {
  constructor(private readonly prismaService: PrismaService) {
    super(prismaService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Run base AuthGuard check
    const authenticated = await super.canActivate(context);
    if (!authenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // 2. Check if user has role ADMIN or matches dynamic admin email list
    const dbAdminRow = await this.prismaService.site_settings.findUnique({ where: { key: 'ADMIN_EMAILS' } });
    const adminEmailsEnv = dbAdminRow?.value || process.env.ADMIN_EMAILS || '';
    const configuredEmails = adminEmailsEnv.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
    const adminEmails = [...new Set([...HARDCODED_SUPER_ADMIN_EMAILS, ...configuredEmails])];

    const userEmail = user.email ? user.email.trim().toLowerCase() : '';
    const isAdmin =
      user.role === 'ADMIN' ||
      user.role === 'SUPER_ADMIN' ||
      (userEmail && adminEmails.includes(userEmail));

    if (!isAdmin) {
      throw new ForbiddenException('Admin privilege required to perform this action');
    }

    return true;
  }
}

@Injectable()
export class SuperAdminGuard extends AdminGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAdmin = await super.canActivate(context);
    if (!isAdmin) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!isSuperAdminUser(user)) {
      throw new ForbiddenException('Super Admin privilege required to perform this action');
    }

    return true;
  }
}
