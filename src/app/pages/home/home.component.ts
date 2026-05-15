import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent {
  isAdmin$: Observable<boolean>;
  currentAdmin$: Observable<string | null>;

  constructor(
    private router: Router,
    private authService: AuthService,
  ) {
    this.isAdmin$ = this.authService.isAdmin();
    this.currentAdmin$ = this.authService.getCurrentAdmin();
  }

  loginAsAdmin(): void {
    this.router.navigate(['/login']);
  }

  bookAsGuest(): void {
    this.router.navigate(['/reservations']);
  }

  goToAdminPanel(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
