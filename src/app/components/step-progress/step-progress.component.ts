import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-step-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './step-progress.component.html',
  styleUrls: ['./step-progress.component.css'],
})
export class StepProgressComponent {
  @Input() currentStep = 1;
  @Input() totalSteps = 1;
  @Input() label = '';

  get safeCurrentStep(): number {
    const current = Number(this.currentStep);
    const total = this.safeTotalSteps;

    if (!Number.isFinite(current)) {
      return 1;
    }

    return Math.min(Math.max(Math.floor(current), 1), total);
  }

  get safeTotalSteps(): number {
    const total = Number(this.totalSteps);
    if (!Number.isFinite(total) || total < 1) {
      return 1;
    }

    return Math.floor(total);
  }

  get progressPercent(): number {
    return (this.safeCurrentStep / this.safeTotalSteps) * 100;
  }
}
