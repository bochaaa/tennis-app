import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
})
export class AdminDashboardComponent {
  currentAdmin$: Observable<string | null>;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {
    this.currentAdmin$ = this.authService.getCurrentAdmin();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
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
}
