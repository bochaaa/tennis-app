import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { NotificationService, NotificationStatus } from '../../services/notification.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
})
export class AdminDashboardComponent {
  currentAdmin$: Observable<string | null>;
  notificationStatus$: Observable<NotificationStatus>;
  unreadNotifications$: Observable<number>;
  isEnablingNotifications = false;

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router,
  ) {
    this.currentAdmin$ = this.authService.getCurrentAdmin();
    this.notificationStatus$ = this.notificationService.status$;
    this.unreadNotifications$ = this.notificationService.unreadCount$;
  }

  logout(): void {
    this.notificationService.unregisterDevice().subscribe(() => {
      this.authService.logout();
      this.router.navigate(['/']);
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToCourts(): void {
    this.router.navigate(['/admin/courts']);
  }

  goToPrices(): void {
    this.router.navigate(['/admin/prices']);
  }

  goToSchedules(): void {
    this.router.navigate(['/admin/schedules']);
  }

  goToRecurringClasses(): void {
    this.router.navigate(['/admin/recurring-classes']);
  }

  goToReservationPayments(): void {
    this.router.navigate(['/admin/reservation-payments']);
  }

  goToNotifications(): void {
    this.router.navigate(['/admin/notifications']);
  }

  enableNotifications(): void {
    this.isEnablingNotifications = true;

    this.notificationService.enableNotifications().subscribe(() => {
      this.isEnablingNotifications = false;
    });
  }

  disableNotifications(): void {
    this.notificationService.unregisterDevice().subscribe();
  }

  clearNotifications(): void {
    this.notificationService.clearNotifications();
  }

  getNotificationStatusLabel(status: NotificationStatus | null): string {
    switch (status) {
      case 'registered':
        return 'Notificaciones activadas';
      case 'backend-pending':
        return 'No se pudieron activar. Probá de nuevo.';
      case 'granted':
        return 'Permiso concedido';
      case 'firebase-config-missing':
        return 'No se pudieron activar';
      case 'denied':
        return 'Permiso bloqueado';
      case 'unsupported':
        return 'No disponible en este navegador';
      default:
        return 'Sin activar';
    }
  }
}
