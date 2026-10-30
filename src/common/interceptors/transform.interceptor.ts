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

export function buildPaginationMeta(
  totalCount: number,
  explicitMeta?: any,
  query?: any,
  fallbackLength = 0,
) {
  // Query parameters: frontend only sends page and skip
  const queryPage = query?.page ? parseInt(query.page, 10) : undefined;
  const querySkip = query?.skip ? parseInt(query.skip, 10) : undefined;

  let total = totalCount;
  if (explicitMeta?.total !== undefined) {
    total = Number(explicitMeta.total);
  } else if (explicitMeta?.total_count !== undefined) {
    total = Number(explicitMeta.total_count);
  } else if (explicitMeta?.totalCount !== undefined) {
    total = Number(explicitMeta.totalCount);
  }

  // Determine limit:
  // Frontend does not send limit; backend determines limit internally (default 50 or explicitMeta)
  let limit = 50;
  if (explicitMeta?.limit !== undefined && Number(explicitMeta.limit) > 0) {
    limit = Number(explicitMeta.limit);
  } else if (fallbackLength > 0) {
    limit = fallbackLength;
  }

  // Determine page and skip
  let page = 1;
  if (explicitMeta?.page !== undefined && Number(explicitMeta.page) > 0) {
    page = Number(explicitMeta.page);
  } else if (queryPage && !isNaN(queryPage) && queryPage > 0) {
    page = queryPage;
  } else if (querySkip !== undefined && !isNaN(querySkip) && limit > 0) {
    page = Math.floor(Math.max(0, querySkip) / limit) + 1;
  }

  let skip = 0;
  if (explicitMeta?.skip !== undefined && !isNaN(Number(explicitMeta.skip))) {
    skip = Math.max(0, Number(explicitMeta.skip));
  } else if (querySkip !== undefined && !isNaN(querySkip)) {
    skip = Math.max(0, querySkip);
  } else if (page > 0) {
    skip = (page - 1) * limit;
  }

  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Strict snake_case only (no duplicate camelCase like totalPages or hasNextPage)
  const result: any = {
    total,
    page,
    limit,
    skip,
    total_pages: totalPages,
    has_next_page: hasNextPage,
    has_prev_page: hasPrevPage,
  };

  // Preserve any additional fields provided in explicitMeta (such as counts, etc.),
  // excluding camelCase duplicates
  if (explicitMeta && typeof explicitMeta === 'object') {
    for (const [k, v] of Object.entries(explicitMeta)) {
      if (
        k === 'totalPages' ||
        k === 'hasNextPage' ||
        k === 'hasPrevPage' ||
        k === 'totalCount' ||
        k === 'pageSize' ||
        k === 'currentPage'
      ) {
        continue;
      }
      if (result[k] === undefined) {
        result[k] = v;
      }
    }
  }

  return result;
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
    const request = httpCtx.getRequest();
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
          if (Array.isArray(resData.data) && resData.meta == null) {
            const headerTotal = response.getHeader ? response.getHeader('x-total-count') : undefined;
            const total = headerTotal !== undefined ? parseInt(String(headerTotal), 10) : resData.data.length;
            resData.meta = buildPaginationMeta(total, null, request?.query, resData.data.length);
          }
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

        // 1. Handle paginated responses with `items`: { items: [...], total, page, limit, ... }
        if (
          resData &&
          typeof resData === 'object' &&
          Array.isArray(resData.items) &&
          ('total' in resData || 'pagination' in resData || 'meta' in resData)
        ) {
          const { items, message: customMsg, pagination, meta: innerMeta, ...rest } = resData;
          data = items;
          const combinedMeta = {
            ...(pagination || {}),
            ...(innerMeta || {}),
            ...rest,
          };
          const totalCount = combinedMeta.total !== undefined ? Number(combinedMeta.total) : items.length;
          meta = buildPaginationMeta(totalCount, combinedMeta, request?.query, items.length);
          if (customMsg) message = customMsg;
          if (response.setHeader && meta?.total !== undefined) {
            response.setHeader('x-total-count', meta.total.toString());
          }
        }
        // 2. Handle paginated responses with `data`: { data: [...], total, page, limit }
        else if (
          resData &&
          typeof resData === 'object' &&
          Array.isArray(resData.data) &&
          ('total' in resData || 'pagination' in resData || 'meta' in resData)
        ) {
          const { data: listData, message: customMsg, pagination, meta: innerMeta, ...rest } = resData;
          data = listData;
          const combinedMeta = {
            ...(pagination || {}),
            ...(innerMeta || {}),
            ...rest,
          };
          const totalCount = combinedMeta.total !== undefined ? Number(combinedMeta.total) : listData.length;
          meta = buildPaginationMeta(totalCount, combinedMeta, request?.query, listData.length);
          if (customMsg) message = customMsg;
          if (response.setHeader && meta?.total !== undefined) {
            response.setHeader('x-total-count', meta.total.toString());
          }
        }
        // 3. Handle responses that already provided data: { data: ..., ... }
        else if (
          resData &&
          typeof resData === 'object' &&
          'data' in resData
        ) {
          data = resData.data;
          meta = resData.meta ?? null;
          if (Array.isArray(data) && meta == null) {
            const headerTotal = response.getHeader ? response.getHeader('x-total-count') : undefined;
            const total = headerTotal !== undefined ? parseInt(String(headerTotal), 10) : data.length;
            meta = buildPaginationMeta(total, null, request?.query, data.length);
          }
          if (resData.message) message = resData.message;
        }
        // 4. Handle raw arrays: resData is [...]
        else if (Array.isArray(resData)) {
          data = resData;
          const headerTotal = response.getHeader ? response.getHeader('x-total-count') : undefined;
          const total = headerTotal !== undefined ? parseInt(String(headerTotal), 10) : resData.length;
          meta = buildPaginationMeta(total, null, request?.query, resData.length);
          if (response.setHeader && meta?.total !== undefined) {
            response.setHeader('x-total-count', meta.total.toString());
          }
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
