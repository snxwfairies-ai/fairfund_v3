import { Module, Global }       from '@nestjs/common';
import { TransactionService }   from './transaction.service';
import { TransactionController } from './transaction.controller';

@Global()
@Module({
  providers:   [TransactionService],
  controllers: [TransactionController],
  exports:     [TransactionService],
})
export class TransactionModule {}
