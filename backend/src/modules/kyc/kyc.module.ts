import { Module, Global } from '@nestjs/common';
import { KYCService }     from './kyc.service';
import { KYCController }  from './kyc.controller';
import { OTPModule }      from '../otp/otp.module';

@Global()
@Module({ imports: [OTPModule], providers: [KYCService], controllers: [KYCController], exports: [KYCService] })
export class KYCModule {}
