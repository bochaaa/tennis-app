import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ReservationAdminItem } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { NotificationService, NotificationStatus } from '../../services/notification.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
})
export class AdminDashboardComponent implements OnInit {
  currentAdmin$: Observable<string | null>;
  notificationStatus$: Observable<NotificationStatus>;
  unreadNotifications$: Observable<number>;
  isEnablingNotifications = false;
  todayReservationsCount = 0;
  isLoadingTodayReservations = false;
  activeCourtsCount = 0;
  isLoadingActiveCourts = false;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.currentAdmin$ = this.authService.getCurrentAdmin();
    this.notificationStatus$ = this.notificationService.status$;
    this.unreadNotifications$ = this.notificationService.unreadCount$;
  }

  ngOnInit(): void {
    this.loadTodayReservationsCount();
    this.loadActiveCourtsCount();
  }

  private loadActiveCourtsCount(): void {
    this.isLoadingActiveCourts = true;

    this.apiService.getCourts().subscribe({
      next: (courts) => {
        this.activeCourtsCount = (Array.isArray(courts) ? courts : []).filter(
          (court) => court.is_active !== false,
        ).length;
        this.isLoadingActiveCourts = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('No se pudieron cargar las canchas activas:', error);
        this.activeCourtsCount = 0;
        this.isLoadingActiveCourts = false;
        this.cdr.detectChanges();
      },
    });
  }

  private loadTodayReservationsCount(): void {
    this.isLoadingTodayReservations = true;

    this.apiService.getReservationsAdmin({ date: this.getTodayDate() }).subscribe({
      next: (response) => {
        this.todayReservationsCount = this.normalizeReservationsResponse(response).filter(
          (reservation) =>
            reservation.status !== 'CANCELLED' &&
            String(reservation.reservation_type || '').trim().toUpperCase() !== 'CLASS',
        ).length;
        this.isLoadingTodayReservations = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('No se pudieron cargar las reservas de hoy:', error);
        this.todayReservationsCount = 0;
        this.isLoadingTodayReservations = false;
        this.cdr.detectChanges();
      },
    });
  }

  private normalizeReservationsResponse(response: unknown): ReservationAdminItem[] {
    if (Array.isArray(response)) {
      return response as ReservationAdminItem[];
    }

    if (response && typeof response === 'object') {
      const bag = response as Record<string, unknown>;

      for (const key of ['results', 'data', 'items', 'reservations']) {
        if (Array.isArray(bag[key])) {
          return bag[key] as ReservationAdminItem[];
        }
      }
    }

    return [];
  }

  private getTodayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
