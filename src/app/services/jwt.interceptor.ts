import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const requestWithToken = this.addTokenIfNeeded(request);

    return next.handle(requestWithToken).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 401) {
          return throwError(() => error);
        }

        if (this.isAuthRequest(request.url)) {
          this.authService.logout();
          return throwError(() => error);
        }

        const refreshToken = this.authService.getRefreshToken();
        if (!refreshToken) {
          this.authService.logout();
          return throwError(() => error);
        }

        if (this.isRefreshing) {
          return this.refreshTokenSubject.pipe(
            filter((token): token is string => token !== null),
            take(1),
            switchMap((token) => next.handle(this.addToken(request, token))),
          );
        }

        this.isRefreshing = true;
        this.refreshTokenSubject.next(null);

        return this.authService.refreshToken().pipe(
          switchMap((newAccessToken) => {
            this.isRefreshing = false;
            this.refreshTokenSubject.next(newAccessToken);
            return next.handle(this.addToken(request, newAccessToken));
          }),
          catchError((refreshError) => {
            this.isRefreshing = false;
            this.authService.logout();
            return throwError(() => refreshError);
          }),
        );
      }),
    );
  }

  private addTokenIfNeeded(request: HttpRequest<unknown>): HttpRequest<unknown> {
    if (this.isAuthRequest(request.url)) {
      return request;
    }

    const token = this.authService.getAccessToken();
    if (!token) {
      return request;
    }

    return this.addToken(request, token);
  }

  private addToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  private isAuthRequest(url: string): boolean {
    return url.includes('/api/token/');
  }
}
