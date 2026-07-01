import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';
import { NotificationService } from './services/notification.service';
import { PwaInstallService } from './services/pwa-install.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  canInstall$: Observable<boolean>;
  showIosInstallGuide$: Observable<boolean>;

  constructor(
    notificationService: NotificationService,
    private pwaInstallService: PwaInstallService,
  ) {
    this.canInstall$ = this.pwaInstallService.canInstall$;
    this.showIosInstallGuide$ = this.pwaInstallService.showIosInstallGuide$;
    notificationService.initialize();
    this.pwaInstallService.initialize();
  }

  installApp(): void {
    this.pwaInstallService.install();
  }

  dismissInstallPrompt(): void {
    this.pwaInstallService.dismiss();
  }
}
