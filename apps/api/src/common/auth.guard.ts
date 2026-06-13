import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = await this.jwt.verifyAsync(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", "dev-access-secret")
      });
      return true;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}
