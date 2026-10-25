import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from './logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly loggerService: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let errorName = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || (res as any).error || exception.message;
      }
      errorName = exception.name;
    } else if (exception instanceof Error) {
      message = exception.message;
      errorName = exception.name;
    }

    // Extract full error stack trace
    let stack: string | null = null;
    if (exception instanceof Error && exception.stack) {
      stack = exception.stack;
    } else if (typeof exception === 'object' && exception !== null && 'stack' in exception) {
      stack = String((exception as any).stack);
    } else if (typeof exception === 'string') {
      stack = exception;
    } else {
      try {
        stack = JSON.stringify(exception, null, 2);
      } catch {
        stack = String(exception);
      }
    }

    // Attach stack trace directly to request and response objects so middleware captures it
    (request as any)._errorStack = stack;
    (request as any)._error = exception;
    (response as any)._errorStack = stack;
    if (response.locals) {
      response.locals.errorStack = stack;
    }

    // Log through Nest logger for console output
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} [${status}]: ${typeof message === 'object' ? JSON.stringify(message) : message}`,
        stack || undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} [${status}]: ${typeof message === 'object' ? JSON.stringify(message) : message}`,
      );
    }

    // Send standardized error response to client if not already sent
    if (!response.headersSent) {
      let formattedMessage = Array.isArray(message)
        ? message.join(', ')
        : typeof message === 'object' && message !== null
        ? (message.message || JSON.stringify(message))
        : String(message);

      // Return user-friendly route not found message when endpoint is unmapped
      if (
        status === HttpStatus.NOT_FOUND &&
        (/^Cannot (GET|POST|PATCH|DELETE|PUT|OPTIONS|HEAD) /i.test(formattedMessage) ||
          formattedMessage === 'Not Found')
      ) {
        formattedMessage = 'Can not find the route';
      } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
        formattedMessage = 'Too many requests. Please slow down and try again later.';
      }

      response.status(status).json({
        success: false,
        message: formattedMessage,
        data: null,
        meta: null,
        status_code: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        error: errorName,
      });
    }
  }
}
