import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type CurrentUser = {
  userId: string;
  email: string;
  isSystemAdmin: boolean;
  businessId?: string;
  role?: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const request = context.switchToHttp().getRequest<{ user: CurrentUser }>();
    return request.user;
  }
);
