import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AdminNotification, NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-notifications.component.html',
})
export class AdminNotificationsComponent implements OnInit {
  currentAdmin$: Observable<string | null>;
  notifications$: Observable<AdminNotification[]>;

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.currentAdmin$ = this.authService.getCurrentAdmin();
    this.notifications$ = this.notificationService.notifications$;
  }

  ngOnInit(): void {
    const pushNotification = this.getPushNotificationFromUrl();
    if (pushNotification) {
      this.notificationService.addReceivedNotification(pushNotification);
      this.router.navigate(['/admin/notifications'], { replaceUrl: true });
    }

    this.notificationService.markAllAsRead();
  }

  logout(): void {
    this.notificationService.unregisterDevice().subscribe(() => {
      this.authService.logout();
      this.router.navigate(['/']);
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  clearNotifications(): void {
    this.notificationService.clearNotifications();
  }

  openNotificationTarget(notification: AdminNotification): void {
    const targetUrl = this.notificationService.getNotificationTargetUrl(notification);

    if (targetUrl) {
      this.router.navigateByUrl(this.normalizeNotificationTargetUrl(targetUrl));
    }
  }

  hasTarget(notification: AdminNotification): boolean {
    return !!this.notificationService.getNotificationTargetUrl(notification);
  }

  private getPushNotificationFromUrl(): Omit<AdminNotification, 'id' | 'readAt'> | null {
    const rawPushNotification = this.route.snapshot.queryParamMap.get('push');
    if (!rawPushNotification) {
      return null;
    }

    try {
      const notification = JSON.parse(rawPushNotification) as Partial<AdminNotification>;
      if (!notification.title || !notification.body) {
        return null;
      }

      return {
        title: notification.title,
        body: notification.body,
        receivedAt: notification.receivedAt || new Date().toISOString(),
        data:
          notification.data && typeof notification.data === 'object'
            ? notification.data
            : undefined,
      };
    } catch {
      return null;
    }
  }

  private normalizeNotificationTargetUrl(targetUrl: string): string {
    try {
      const parsedUrl = new URL(targetUrl, window.location.origin);

      if (parsedUrl.pathname === '/admin/reservations') {
        const params = new URLSearchParams();
        const date = parsedUrl.searchParams.get('date');
        const reservationId = parsedUrl.searchParams.get('reservation_id');

        if (date) {
          params.set('date', date);
        }
        if (reservationId) {
          params.set('reservation_id', reservationId);
        }

        const queryString = params.toString();
        return `/admin/reservation-payments${queryString ? `?${queryString}` : ''}`;
      }

      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } catch {
      return targetUrl;
    }
  }
}
