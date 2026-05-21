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
    path: 'reservations',
    component: ReservationsComponent,
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
