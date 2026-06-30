import { Routes } from '@angular/router';
import { AdminGuard } from './guards/admin.guard';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { ReservationsComponent } from './pages/reservations/reservations.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
  },
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'reservations/payments',
    loadComponent: () =>
      import('./pages/reservation-payment-search/reservation-payment-search.component').then(
        (m) => m.ReservationPaymentSearchComponent,
      ),
  },
  {
    path: 'reservations',
    component: ReservationsComponent,
  },
  {
    path: 'pago/success',
    loadComponent: () =>
      import('./pages/payment-return/payment-return.component').then(
        (m) => m.PaymentReturnComponent,
      ),
    data: { state: 'success' },
  },
  {
    path: 'pago/failure',
    loadComponent: () =>
      import('./pages/payment-return/payment-return.component').then(
        (m) => m.PaymentReturnComponent,
      ),
    data: { state: 'failure' },
  },
  {
    path: 'pago/pending',
    loadComponent: () =>
      import('./pages/payment-return/payment-return.component').then(
        (m) => m.PaymentReturnComponent,
      ),
    data: { state: 'pending' },
  },
  {
    path: 'admin',
    canActivate: [AdminGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/admin-dashboard/admin-dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'courts',
        loadComponent: () =>
          import('./pages/admin-courts/admin-courts.component').then((m) => m.AdminCourtsComponent),
      },
      {
        path: 'prices',
        loadComponent: () =>
          import('./pages/admin-prices/admin-prices.component').then((m) => m.AdminPricesComponent),
      },
      {
        path: 'schedules',
        loadComponent: () =>
          import('./pages/admin-schedules/admin-schedules.component').then(
            (m) => m.AdminSchedulesComponent,
          ),
      },
      {
        path: 'recurring-classes',
        loadComponent: () =>
          import('./pages/admin-recurring-classes/admin-recurring-classes.component').then(
            (m) => m.AdminRecurringClassesComponent,
          ),
      },
      {
        path: 'reservation-payments',
        loadComponent: () =>
          import('./pages/admin-reservation-payments/admin-reservation-payments.component').then(
            (m) => m.AdminReservationPaymentsComponent,
          ),
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
