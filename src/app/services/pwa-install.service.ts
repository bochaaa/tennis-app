import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Injectable({
  providedIn: 'root',
})
export class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isDismissedSubject = new BehaviorSubject<boolean>(false);
  private canInstallSubject = new BehaviorSubject<boolean>(false);
  private showIosInstallGuideSubject = new BehaviorSubject<boolean>(false);
  private hasReloadedForServiceWorkerUpdate = false;

  canInstall$ = this.canInstallSubject.asObservable();
  showIosInstallGuide$ = this.showIosInstallGuideSubject.asObservable();
  isDismissed$ = this.isDismissedSubject.asObservable();

  initialize(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.registerServiceWorker();
    this.updateIosInstallGuideState();

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstallSubject.next(!this.isDismissedSubject.value);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstallSubject.next(false);
      this.showIosInstallGuideSubject.next(false);
    });
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) {
      return;
    }

    const promptEvent = this.deferredPrompt;
    this.deferredPrompt = null;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    this.canInstallSubject.next(false);
  }

  dismiss(): void {
    this.isDismissedSubject.next(true);
    this.canInstallSubject.next(false);
    this.showIosInstallGuideSubject.next(false);
  }

  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          this.watchServiceWorkerUpdates(registration);
          registration.update().catch(() => undefined);
        })
        .catch(() => undefined);
    });
  }

  private watchServiceWorkerUpdates(registration: ServiceWorkerRegistration): void {
    registration.addEventListener('updatefound', () => {
      const isUpdatingExistingWorker = !!navigator.serviceWorker.controller;
      const installingWorker = registration.installing;
      if (!installingWorker) {
        return;
      }

      installingWorker.addEventListener('statechange', () => {
        if (
          installingWorker.state === 'activated' &&
          isUpdatingExistingWorker &&
          navigator.serviceWorker.controller &&
          !this.hasReloadedForServiceWorkerUpdate
        ) {
          this.hasReloadedForServiceWorkerUpdate = true;
          window.location.reload();
        }
      });
    });
  }

  private updateIosInstallGuideState(): void {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      navigatorWithStandalone.standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    this.showIosInstallGuideSubject.next(isIos && !isStandalone && !this.isDismissedSubject.value);
  }
}
