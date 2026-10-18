import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  meta: any;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardApiResponse<T>> {
    const httpCtx = context.switchToHttp();
    const response = httpCtx.getResponse();

    return next.handle().pipe(
      map((resData) => {
        // If response is already sent (e.g. file stream or redirect), return as-is
        if (response.headersSent) {
          return resData;
        }

        // If response is already strictly structured with { success, message, data, meta }
        if (
          resData &&
          typeof resData === 'object' &&
          'success' in resData &&
          'data' in resData &&
          'meta' in resData
        ) {
          return resData;
        }

        let message = 'Operation successful';
        let data: any = resData;
        let meta: any = null;

        // Extract custom message if returned
        if (resData && typeof resData === 'object' && 'message' in resData) {
          if (typeof resData.message === 'string') {
            message = resData.message;
          }
        }

        // Handle paginated responses with `items`: { items: [...], total, page, limit, totalPages }
        if (
          resData &&
          typeof resData === 'object' &&
          Array.isArray(resData.items) &&
          'total' in resData
        ) {
          const { items, message: customMsg, ...paginationMeta } = resData;
          data = items;
          meta = paginationMeta;
          if (customMsg) message = customMsg;
        }
        // Handle paginated responses with `data`: { data: [...], total, page, limit }
        else if (
          resData &&
          typeof resData === 'object' &&
          Array.isArray(resData.data) &&
          'total' in resData
        ) {
          const { data: listData, message: customMsg, ...paginationMeta } = resData;
          data = listData;
          meta = paginationMeta;
          if (customMsg) message = customMsg;
        }
        // Handle responses that already provided data: { data: ..., ... }
        else if (
          resData &&
          typeof resData === 'object' &&
          'data' in resData
        ) {
          data = resData.data;
          meta = resData.meta ?? null;
          if (resData.message) message = resData.message;
        }

        return {
          success: true,
          message,
          data: data ?? null,
          meta,
        };
      }),
    );
  }
}
