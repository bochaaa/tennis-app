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
import {
  ApiService,
  NotificationDeviceRequest,
  NotificationHistoryItem,
} from './api.service';

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
  readAt?: string;
  data?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly tokenStorageKey = 'admin_fcm_token';
  private readonly deviceIdStorageKey = 'admin_notification_device_id';
  private readonly notificationsStorageKey = 'admin_notifications';
  private statusSubject = new BehaviorSubject<NotificationStatus>(this.getInitialStatus());
  private notificationsSubject = new BehaviorSubject<AdminNotification[]>(
    this.getStoredNotifications(),
  );
  private registrationPromise?: Promise<ServiceWorkerRegistration>;
  private firebaseApp?: FirebaseApp;
  private messaging?: Messaging;

  status$ = this.statusSubject.asObservable();
  notifications$ = this.notificationsSubject.asObservable();
  unreadCount$ = this.notifications$.pipe(
    map((notifications) => notifications.filter((notification) => !notification.readAt).length),
  );

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
          body: this.getBodyWithReservationDate(
            payload.body || 'Hay una novedad en el panel.',
            payload.data,
          ),
          receivedAt: payload.receivedAt || new Date().toISOString(),
          data: payload.data,
        });
      }

      if (payload.type === 'OPEN_NOTIFICATION_TARGET' && payload.url) {
        window.location.assign('/admin/notifications');
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
        .catch((error) => {
          this.handleRegistrationError(error);
          observer.next(this.statusSubject.value);
          observer.complete();
        });
    });
  }

  unregisterDevice(): Observable<unknown> {
    const token = localStorage.getItem(this.tokenStorageKey);

    if (!token) {
      this.statusSubject.next(this.getInitialStatus());
      return of(null);
    }

    return this.apiService
      .unregisterNotificationDevice({
        token,
      })
      .pipe(
        map((response) => {
          localStorage.removeItem(this.tokenStorageKey);
          this.statusSubject.next(this.getInitialStatus());
          return response;
        }),
        catchError(() => of(null)),
      );
  }

  addLocalReservationNotification(title: string, body: string, data?: Record<string, unknown>): void {
    this.addReceivedNotification({
      title,
      body,
      data,
      receivedAt: new Date().toISOString(),
    });
  }

  addReceivedNotification(notification: Omit<AdminNotification, 'id' | 'readAt'>): void {
    this.addNotification({
      ...notification,
      body: this.getBodyWithReservationDate(notification.body, notification.data),
    });
  }

  loadNotificationHistory(limit = 15): Observable<AdminNotification[]> {
    return this.apiService.getNotificationHistory(limit).pipe(
      map((history) => this.mergeNotificationHistory(history)),
      catchError((error) => {
        console.error('No se pudo cargar el historial de notificaciones.', error);
        return of(this.notificationsSubject.value);
      }),
    );
  }

  clearNotifications(): void {
    this.notificationsSubject.next([]);
    localStorage.removeItem(this.notificationsStorageKey);
  }

  markAllAsRead(): void {
    const readAt = new Date().toISOString();
    this.setNotifications(
      this.notificationsSubject.value.map((notification) => ({
        ...notification,
        readAt: notification.readAt || readAt,
      })),
    );
  }

  getNotificationTargetUrl(notification: AdminNotification): string | null {
    const url = notification.data?.['url'];
    return typeof url === 'string' ? url : null;
  }

  private async requestPermissionAndRegisterDevice(): Promise<NotificationStatus> {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      return permission;
    }

    return this.registerDevice(true);
  }

  private async registerDevice(showSuccessNotification: boolean): Promise<NotificationStatus> {
    if (!environment.firebase.vapidKey) {
      return 'firebase-config-missing';
    }

    const registration = await this.registerServiceWorker();

    const messaging = await this.getMessagingInstance();
    const token = await getToken(messaging, {
      vapidKey: environment.firebase.vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return 'backend-pending';
    }

    const payload: NotificationDeviceRequest = {
      platform: 'web',
      provider: 'fcm',
      token,
      device_id: this.getOrCreateDeviceId(),
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
            if (showSuccessNotification) {
              this.addNotification({
                title: 'Notificaciones activadas',
                body: 'Listo, te van a llegar avisos cuando entre una nueva reserva.',
                receivedAt: new Date().toISOString(),
              });
            }
          }

          resolve(status);
        });
    });
  }

  private registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    if (!this.registrationPromise) {
      this.registrationPromise = navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        updateViaCache: 'none',
      });
    }

    return this.registrationPromise;
  }

  private getOrCreateDeviceId(): string {
    const storedDeviceId = localStorage.getItem(this.deviceIdStorageKey);
    if (storedDeviceId) {
      return storedDeviceId;
    }

    const randomId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const deviceId = `web-${randomId}`;
    localStorage.setItem(this.deviceIdStorageKey, deviceId);
    return deviceId;
  }

  private handleRegistrationError(error: unknown): void {
    console.error('No se pudo completar el registro de notificaciones push.', error);
    this.statusSubject.next('backend-pending');
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
          body: this.getBodyWithReservationDate(body, payload.data),
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
    this.setNotifications(this.deduplicateNotifications([
      {
        ...notification,
        id: this.getNotificationId(notification.data) || this.createLocalNotificationId(),
      },
      ...currentNotifications,
    ]));
  }

  private mergeNotificationHistory(history: NotificationHistoryItem[]): AdminNotification[] {
    const currentNotifications = this.notificationsSubject.value;
    const readAtByKey = new Map(
      currentNotifications
        .filter((notification) => notification.readAt)
        .map((notification) => [this.getNotificationKey(notification), notification.readAt]),
    );
    const historyNotifications = history.map((item) => {
      const data = {
        ...(item.data || {}),
        notification_id: item.notification_id,
      };
      const notification: AdminNotification = {
        id: item.notification_id,
        title: item.title,
        body: this.getBodyWithReservationDate(item.body, data),
        receivedAt: item.created_at,
        data,
      };
      const readAt = readAtByKey.get(this.getNotificationKey(notification));

      return readAt ? { ...notification, readAt } : notification;
    });
    const mergedNotifications = this.deduplicateNotifications([
      ...historyNotifications,
      ...currentNotifications,
    ]).sort(
      (left, right) => this.getNotificationTimestamp(right) - this.getNotificationTimestamp(left),
    );

    this.setNotifications(mergedNotifications);
    return this.notificationsSubject.value;
  }

  private deduplicateNotifications(notifications: AdminNotification[]): AdminNotification[] {
    const seenKeys = new Set<string>();

    return notifications.filter((notification) => {
      const key = this.getNotificationKey(notification);
      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
  }

  private getNotificationKey(notification: AdminNotification): string {
    const notificationId = this.getNotificationId(notification.data);
    return notificationId ? `server:${notificationId}` : `local:${notification.id}`;
  }

  private getNotificationId(data?: Record<string, unknown>): string {
    const notificationId = data?.['notification_id'];
    return typeof notificationId === 'string' && notificationId.trim()
      ? notificationId.trim()
      : '';
  }

  private createLocalNotificationId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private getNotificationTimestamp(notification: AdminNotification): number {
    const timestamp = new Date(notification.receivedAt).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private getBodyWithReservationDate(
    body: string,
    data?: Record<string, unknown>,
  ): string {
    const dateLabel = this.getReservationDateLabel(data);

    if (!dateLabel || body.includes(dateLabel)) {
      return body;
    }

    return `${body} - ${dateLabel}`;
  }

  private getReservationDateLabel(data?: Record<string, unknown>): string {
    const rawDate = this.getReservationDate(data);

    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return '';
    }

    const [year, month, day] = rawDate.split('-');
    return `${day}/${month}/${year}`;
  }

  private getReservationDate(data?: Record<string, unknown>): string {
    const explicitDate = data?.['date'];
    if (typeof explicitDate === 'string' && explicitDate.trim().length > 0) {
      return explicitDate.trim();
    }

    const url = data?.['url'];
    if (typeof url !== 'string' || url.trim().length === 0) {
      return '';
    }

    try {
      return new URL(url, window.location.origin).searchParams.get('date') || '';
    } catch {
      return '';
    }
  }

  private setNotifications(notifications: AdminNotification[]): void {
    const latestNotifications = notifications.slice(0, 50);
    this.notificationsSubject.next(latestNotifications);
    localStorage.setItem(this.notificationsStorageKey, JSON.stringify(latestNotifications));
  }

  private getStoredNotifications(): AdminNotification[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const rawNotifications = localStorage.getItem(this.notificationsStorageKey);
      if (!rawNotifications) {
        return [];
      }

      const notifications = JSON.parse(rawNotifications);
      return Array.isArray(notifications) ? notifications : [];
    } catch {
      return [];
    }
  }

  private getInitialStatus(): NotificationStatus {
    if (!this.isBrowserNotificationSupported()) {
      return 'unsupported';
    }

    if (Notification.permission === 'granted' && localStorage.getItem(this.tokenStorageKey)) {
      return 'registered';
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
}
