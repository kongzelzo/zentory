import { BadRequestException, Body, Controller, ForbiddenException, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { AuthGuard } from "../common/auth.guard";
import { CurrentUser, type CurrentUser as CurrentUserType } from "../common/current-user.decorator";
import { CheckoutPaymentDto, ConfirmCheckoutDto, PaymentWebhookDto } from "../common/dto";
import { PermissionGuard } from "../common/roles.guard";
import { ZentoryService } from "../zentory.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly service: ZentoryService,
    private readonly config: ConfigService
  ) {}

  @Post("checkout")
  @UseGuards(AuthGuard)
  checkout(@CurrentUser() user: CurrentUserType, @Body() dto: CheckoutPaymentDto) {
    return this.service.createAccountPaymentRequest(user, dto);
  }

  @Post("checkout/confirm")
  @UseGuards(AuthGuard)
  confirmCheckout(@CurrentUser() user: CurrentUserType, @Body() dto: ConfirmCheckoutDto) {
    return this.service.confirmStripeCheckoutSession(user, dto);
  }

  @Post("portal")
  @UseGuards(AuthGuard, PermissionGuard("subscription.manage"))
  portal(@CurrentUser() user: CurrentUserType) {
    return this.service.createBillingPortalSession(user);
  }

  @Post("subscription/cancel-at-period-end")
  @UseGuards(AuthGuard, PermissionGuard("subscription.manage"))
  cancelAtPeriodEnd(@CurrentUser() user: CurrentUserType) {
    return this.service.cancelStripeSubscriptionAtPeriodEnd(user);
  }

  @Post("webhook")
  webhook(@Headers("x-zentory-payment-secret") secret: string | undefined, @Body() dto: PaymentWebhookDto) {
    const expected = this.config.get("PAYMENT_WEBHOOK_SECRET", "dev-payment-webhook-secret");
    if (!secret || secret !== expected) throw new ForbiddenException("Invalid payment webhook secret");
    return this.service.handlePaymentWebhook(dto);
  }

  @Post("stripe-webhook")
  stripeWebhook(@Headers("stripe-signature") signature: string | string[] | undefined, @Req() request: any) {
    const webhookSecret = this.config.get<string>("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) throw new ForbiddenException("Stripe webhook secret is not configured");

    const rawBody = request.rawBody as Buffer | undefined;
    if (!rawBody) throw new BadRequestException("Missing raw request body");

    const event = this.verifyStripeEvent(rawBody, Array.isArray(signature) ? signature[0] : signature, webhookSecret);
    return this.service.handleStripeWebhookEvent(event);
  }

  private verifyStripeEvent(rawBody: Buffer, signature: string | undefined, webhookSecret: string) {
    if (!signature) throw new ForbiddenException("Missing Stripe signature");

    const parts = Object.fromEntries(signature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }));
    const timestamp = parts.t;
    const expectedSignature = parts.v1;
    if (!timestamp || !expectedSignature) throw new ForbiddenException("Invalid Stripe signature");

    const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
    const actualSignature = createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
    const expected = Buffer.from(expectedSignature, "hex");
    const actual = Buffer.from(actualSignature, "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new ForbiddenException("Invalid Stripe signature");
    }

    return JSON.parse(rawBody.toString("utf8"));
  }
}
