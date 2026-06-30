import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
  Messaging,
  onMessage,
} from 'firebase/messaging';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ApiService, NotificationDeviceRequest } from './api.service';

export type NotificationStatus =
  | 'unsupported'
  | 'default'
  | 'denied'
  | 'granted'
  | 'firebase-config-missing'
  | 'registered'
  | 'backend-pending';

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  data?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly tokenStorageKey = 'admin_fcm_token';
  private statusSubject = new BehaviorSubject<NotificationStatus>(this.getInitialStatus());
  private notificationsSubject = new BehaviorSubject<AdminNotification[]>([]);
  private registrationPromise?: Promise<ServiceWorkerRegistration>;
  private firebaseApp?: FirebaseApp;
  private messaging?: Messaging;

  status$ = this.statusSubject.asObservable();
  notifications$ = this.notificationsSubject.asObservable();

  constructor(private apiService: ApiService) {}

  initialize(): void {
    if (!this.isBrowserNotificationSupported()) {
      this.statusSubject.next('unsupported');
      return;
    }

    this.setupForegroundMessages();

    navigator.serviceWorker.addEventListener('message', (event) => {
      const payload = event.data as {
        type?: string;
        title?: string;
        body?: string;
        receivedAt?: string;
        data?: Record<string, unknown>;
        url?: string;
      };

      if (payload.type === 'PUSH_NOTIFICATION') {
        this.addNotification({
          title: payload.title || 'Nueva reserva',
          body: payload.body || 'Hay una novedad en el panel.',
          receivedAt: payload.receivedAt || new Date().toISOString(),
          data: payload.data,
        });
      }

      if (payload.type === 'OPEN_NOTIFICATION_TARGET' && payload.url) {
        window.location.assign(payload.url);
      }
    });
  }

  enableNotifications(): Observable<NotificationStatus> {
    if (!this.isBrowserNotificationSupported()) {
      this.statusSubject.next('unsupported');
      return of('unsupported');
    }

    return new Observable<NotificationStatus>((observer) => {
      this.requestPermissionAndRegisterDevice()
        .then((status) => {
          this.statusSubject.next(status);
          observer.next(status);
          observer.complete();
        })
        .catch(() => {
          this.statusSubject.next(this.getInitialStatus());
          observer.next(this.statusSubject.value);
          observer.complete();
        });
    });
  }

  unregisterDevice(): Observable<unknown> {
    const token = localStorage.getItem(this.tokenStorageKey);

    if (!token) {
      return of(null);
    }

    return this.apiService
      .unregisterNotificationDevice({
        token,
      })
      .pipe(
        map((response) => {
          localStorage.removeItem(this.tokenStorageKey);
          return response;
        }),
        catchError(() => of(null)),
      );
  }

  addLocalReservationNotification(title: string, body: string, data?: Record<string, unknown>): void {
    this.addNotification({
      title,
      body,
      data,
      receivedAt: new Date().toISOString(),
    });
  }

  clearNotifications(): void {
    this.notificationsSubject.next([]);
  }

  private async requestPermissionAndRegisterDevice(): Promise<NotificationStatus> {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      return permission;
    }

    if (!environment.firebaseVapidKey) {
      return 'firebase-config-missing';
    }

    const registration = await this.registerServiceWorker();
    const messaging = await this.getMessagingInstance();
    const token = await getToken(messaging, {
      vapidKey: environment.firebaseVapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return 'backend-pending';
    }

    const payload: NotificationDeviceRequest = {
      platform: 'web',
      provider: 'fcm',
      token,
      device_id: this.getDeviceId(),
    };

    return await new Promise<NotificationStatus>((resolve) => {
      this.apiService
        .registerNotificationDevice(payload)
        .pipe(
          map(() => 'registered' as NotificationStatus),
          catchError(() => of('backend-pending' as NotificationStatus)),
        )
        .subscribe((status) => {
          if (status === 'registered') {
            localStorage.setItem(this.tokenStorageKey, token);
            this.addNotification({
              title: 'Dispositivo registrado',
              body: 'Este navegador ya quedo registrado para recibir notificaciones reales de Firebase Cloud Messaging.',
              receivedAt: new Date().toISOString(),
            });
          }

          resolve(status);
        });
    });
  }

  private registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    if (!this.registrationPromise) {
      this.registrationPromise = navigator.serviceWorker.register('/firebase-messaging-sw.js');
    }

    return this.registrationPromise;
  }

  private async setupForegroundMessages(): Promise<void> {
    try {
      const messaging = await this.getMessagingInstance();

      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.['title'] || 'Nueva reserva';
        const body =
          payload.notification?.body ||
          payload.data?.['body'] ||
          'Hay una novedad en el panel.';

        this.addNotification({
          title,
          body,
          receivedAt: new Date().toISOString(),
          data: payload.data,
        });
      });
    } catch {
      this.statusSubject.next('unsupported');
    }
  }

  private async getMessagingInstance(): Promise<Messaging> {
    if (this.messaging) {
      return this.messaging;
    }

    const isSupported = await isMessagingSupported();

    if (!isSupported) {
      throw new Error('Firebase messaging is not supported in this browser');
    }

    if (!this.firebaseApp) {
      this.firebaseApp = initializeApp(environment.firebase);
    }

    this.messaging = getMessaging(this.firebaseApp);
    return this.messaging;
  }

  private addNotification(notification: Omit<AdminNotification, 'id'>): void {
    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([
      {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
      ...currentNotifications,
    ]);
  }

  private getInitialStatus(): NotificationStatus {
    if (!this.isBrowserNotificationSupported()) {
      return 'unsupported';
    }

    return Notification.permission;
  }

  private isBrowserNotificationSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator
    );
  }

  private getDeviceId(): string {
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes('android')) {
      return 'android-web';
    }

    if (userAgent.includes('chrome')) {
      return 'chrome-web';
    }

    if (userAgent.includes('firefox')) {
      return 'firefox-web';
    }

    if (userAgent.includes('safari')) {
      return 'safari-web';
    }

    return 'web-admin';
  }
}
