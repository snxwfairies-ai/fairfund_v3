// src/common/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx  = host.switchToHttp();
    const req  = ctx.getRequest<Request>();
    const res  = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException
      ? (exception.getResponse() as any)?.message || exception.message
      : 'Internal server error';
    if (status >= 500) this.logger.error(`${req.method} ${req.url} → ${status}`, String(exception));
    res.status(status).json({ statusCode: status, message, path: req.url, timestamp: new Date().toISOString() });
  }
}
