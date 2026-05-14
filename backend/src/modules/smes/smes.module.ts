// src/modules/smes/smes.module.ts
import { Module } from '@nestjs/common';
import { SmesService }    from './smes.service';
import { SmesController } from './smes.controller';
@Module({ providers: [SmesService], controllers: [SmesController], exports: [SmesService] })
export class SmesModule {}
