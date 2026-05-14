import { Module, Global } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';

@Global()  // Available everywhere without re-importing
@Module({
  providers:   [LedgerService],
  controllers: [LedgerController],
  exports:     [LedgerService],
})
export class LedgerModule {}
