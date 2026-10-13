import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../database/prisma.service';

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
    const adminEmailsEnv = dbAdminRow?.value || process.env.ADMIN_EMAILS || 'admin@example.com,srabon@example.com';
    const adminEmails = adminEmailsEnv.split(',').map((email) => email.trim().toLowerCase());

    const isAdmin = user.role === 'ADMIN' || adminEmails.includes(user.email.toLowerCase());

    if (!isAdmin) {
      throw new ForbiddenException('Admin privilege required to perform this action');
    }

    return true;
  }
}
