import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OAuthController } from './oauth.controller';
import { WellKnownController } from './well-known.controller';
import { OAuthService } from './oauth.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OAuthController, WellKnownController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
