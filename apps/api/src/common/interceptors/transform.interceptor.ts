import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  meta?: {
    timestamp: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return (next.handle() as any).pipe(
      map((data) => {
        // If already wrapped, return as-is
        if (data && typeof data === 'object' && 'data' in data) {
          return data;
        }

        return {
          data,
          meta: {
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
