// src/common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // No @Roles() decorator → route is role-agnostic (JWT-only)
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user?.role) throw new ForbiddenException('No role assigned to this account');

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required: [${requiredRoles.join(', ')}]. Your role: ${user.role}`
      );
    }
    return true;
  }
}
