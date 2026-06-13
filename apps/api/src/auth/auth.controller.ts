import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { BusinessDto, ForgotPasswordDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto } from "../common/dto";
import { AuthService } from "./auth.service";

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("auth/register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("auth/login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("auth/forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post("auth/reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post("auth/refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("auth/logout")
  @UseGuards(AuthGuard)
  logout(@CurrentUser() user: CurrentUser) {
    return this.auth.logout(user.userId);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: CurrentUser) {
    return this.auth.me(user.userId);
  }

  @Post("businesses")
  @UseGuards(AuthGuard)
  createBusiness(@CurrentUser() user: CurrentUser, @Body() dto: BusinessDto) {
    return this.auth.createBusiness(user.userId, dto);
  }
}
