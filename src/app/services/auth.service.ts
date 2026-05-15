import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { LoginRequest, LoginResponse } from '../models';

interface RefreshResponse {
  access: string;
  refresh?: string;
}

interface AuthMeResponse {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = 'http://127.0.0.1:8000/api';
  private isAdmin$ = new BehaviorSubject<boolean>(false);
  private currentAdmin$ = new BehaviorSubject<string | null>(null);
  private rawHttp: HttpClient;

  constructor(httpBackend: HttpBackend) {
    this.rawHttp = new HttpClient(httpBackend);
    this.checkAuth();
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.rawHttp.post<LoginResponse>(`${this.apiUrl}/token/`, credentials).pipe(
      tap((response) => {
        localStorage.setItem('access_token', response.access);
        localStorage.setItem('refresh_token', response.refresh);
        this.isAdmin$.next(true);

        const payload = this.decodeJwtPayload(response.access);
        this.currentAdmin$.next(payload?.username || 'Admin');
        this.syncCurrentUserProfile();
      }),
    );
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.isAdmin$.next(false);
    this.currentAdmin$.next(null);
  }

  isAdmin(): Observable<boolean> {
    return this.isAdmin$.asObservable();
  }

  getCurrentAdmin(): Observable<string | null> {
    return this.currentAdmin$.asObservable();
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  isAuthenticated(): boolean {
    if (this.isAccessTokenValid()) {
      return true;
    }

    return !!this.getRefreshToken();
  }

  private checkAuth(): void {
    const access = this.getAccessToken();
    const refresh = this.getRefreshToken();

    if (!access && !refresh) {
      return;
    }

    if (access) {
      const payload = this.decodeJwtPayload(access);
      this.currentAdmin$.next(payload?.username || 'Admin');
    }

    if (this.isAccessTokenValid() || refresh) {
      this.isAdmin$.next(true);
      if (!this.currentAdmin$.value) {
        this.currentAdmin$.next('Admin');
      }
      if (this.isAccessTokenValid()) {
        this.syncCurrentUserProfile();
      }
      return;
    }

    this.logout();
  }

  refreshToken(): Observable<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    return this.rawHttp
      .post<RefreshResponse>(`${this.apiUrl}/token/refresh/`, {
        refresh: refreshToken,
      })
      .pipe(
        tap((response) => {
          localStorage.setItem('access_token', response.access);
          if (response.refresh) {
            localStorage.setItem('refresh_token', response.refresh);
          }
          this.isAdmin$.next(true);
          this.syncCurrentUserProfile();
        }),
        map((response) => response.access),
      );
  }

  private syncCurrentUserProfile(): void {
    const access = this.getAccessToken();
    if (!access) {
      return;
    }

    this.rawHttp
      .get<AuthMeResponse>(`${this.apiUrl}/auth/me/`, {
        headers: new HttpHeaders({
          Authorization: `Bearer ${access}`,
        }),
      })
      .pipe(catchError(() => of(null)))
      .subscribe((profile) => {
        if (!profile) {
          return;
        }

        const displayName = this.buildDisplayName(profile);
        if (displayName) {
          this.currentAdmin$.next(displayName);
        }
      });
  }

  private buildDisplayName(profile: AuthMeResponse): string | null {
    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    if (fullName.length > 0) {
      return fullName;
    }

    if (profile.username && profile.username.trim().length > 0) {
      return profile.username.trim();
    }

    if (profile.email && profile.email.trim().length > 0) {
      return profile.email.trim();
    }

    return null;
  }

  private isAccessTokenValid(): boolean {
    const token = this.getAccessToken();
    if (!token) {
      return false;
    }

    const payload = this.decodeJwtPayload(token);
    if (!payload?.exp) {
      return true;
    }

    return payload.exp * 1000 > Date.now();
  }

  private decodeJwtPayload(token: string): { username?: string; exp?: number } | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        return null;
      }

      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}
