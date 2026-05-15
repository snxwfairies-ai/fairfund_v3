import { Module, Global } from '@nestjs/common';
import { AIService }      from './ai.service';
import { AIController }   from './ai.controller';

@Global()
@Module({ providers: [AIService], controllers: [AIController], exports: [AIService] })
export class AIModule {}
