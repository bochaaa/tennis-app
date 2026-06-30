import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  AdminNotification,
  NotificationService,
  NotificationStatus,
} from '../../services/notification.service';

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
  notifications$: Observable<AdminNotification[]>;
  isEnablingNotifications = false;

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router,
  ) {
    this.currentAdmin$ = this.authService.getCurrentAdmin();
    this.notificationStatus$ = this.notificationService.status$;
    this.notifications$ = this.notificationService.notifications$;
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

  enableNotifications(): void {
    this.isEnablingNotifications = true;

    this.notificationService.enableNotifications().subscribe(() => {
      this.isEnablingNotifications = false;
    });
  }

  clearNotifications(): void {
    this.notificationService.clearNotifications();
  }

  getNotificationStatusLabel(status: NotificationStatus | null): string {
    switch (status) {
      case 'registered':
        return 'Dispositivo registrado para pruebas';
      case 'backend-pending':
        return 'Permiso activo, no se pudo registrar en backend';
      case 'granted':
        return 'Permiso activo';
      case 'firebase-config-missing':
        return 'Falta clave Web Push de Firebase';
      case 'denied':
        return 'Permiso bloqueado';
      case 'unsupported':
        return 'No disponible en este navegador';
      default:
        return 'Sin activar';
    }
  }
}
