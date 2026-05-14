import { Module }      from '@nestjs/common';
import { CaService }   from './ca.service';
import { CaController } from './ca.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports:     [OnboardingModule],
  providers:   [CaService],
  controllers: [CaController],
  exports:     [CaService],
})
export class CaModule {}
