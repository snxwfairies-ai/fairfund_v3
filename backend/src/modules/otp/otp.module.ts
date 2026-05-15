import { Module, Global } from '@nestjs/common';
import { OTPService }     from './otp.service';
import { OTPController }  from './otp.controller';

@Global()
@Module({ providers: [OTPService], controllers: [OTPController], exports: [OTPService] })
export class OTPModule {}
