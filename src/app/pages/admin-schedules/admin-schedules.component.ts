import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DayOfWeek, Schedule, ScheduleWriteRequest } from '../../models';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-schedules',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-schedules.component.html',
  styleUrls: ['./admin-schedules.component.css'],
})
export class AdminSchedulesComponent implements OnInit {
  readonly daysOfWeek: DayOfWeek[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ];

  schedules: Schedule[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  successMessage = '';

  scheduleForm!: FormGroup;
  editingScheduleId: number | null = null;

  constructor(
    private readonly apiService: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.scheduleForm = this.formBuilder.group({
      day_of_week: ['MONDAY', Validators.required],
      open_time: ['08:00'],
      close_time: ['22:00'],
      is_closed: [false],
    });

    this.loadSchedules();
  }

  loadSchedules(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getSchedules().subscribe({
      next: (schedules) => {
        this.schedules = this.sortSchedules(schedules);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.detail || 'No se pudieron cargar los horarios.';
        this.cdr.detectChanges();
      },
    });
  }

  submitScheduleForm(): void {
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    const payload = this.buildPayload();
    if (!payload) {
      this.errorMessage = 'Revisa horarios: hora de apertura y cierre son invalidas.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    if (this.editingScheduleId) {
      this.apiService.updateSchedule(this.editingScheduleId, payload).subscribe({
        next: () => this.onSaved('Horario actualizado correctamente.'),
        error: (error) => this.onSaveError(error),
      });
      return;
    }

    this.apiService.createSchedule(payload).subscribe({
      next: () => this.onSaved('Horario creado correctamente.'),
      error: (error) => this.onSaveError(error),
    });
  }

  editSchedule(schedule: Schedule): void {
    this.editingScheduleId = schedule.id;
    this.successMessage = '';
    this.errorMessage = '';

    this.scheduleForm.patchValue({
      day_of_week: schedule.day_of_week,
      open_time: this.toInputTime(schedule.open_time) || '08:00',
      close_time: this.toInputTime(schedule.close_time) || '22:00',
      is_closed: !!schedule.is_closed,
    });
  }

  cancelEdit(): void {
    this.editingScheduleId = null;
    this.scheduleForm.reset({
      day_of_week: 'MONDAY',
      open_time: '08:00',
      close_time: '22:00',
      is_closed: false,
    });
  }

  deleteSchedule(schedule: Schedule): void {
    const confirmed = confirm(
      `Eliminar horario de ${this.getDayLabel(schedule.day_of_week)}? Esta accion no se puede deshacer.`,
    );
    if (!confirmed) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.apiService.deleteSchedule(schedule.id).subscribe({
      next: () => {
        this.successMessage = 'Horario eliminado correctamente.';
        this.loadSchedules();
      },
      error: (error) => {
        this.errorMessage = error?.error?.detail || 'No se pudo eliminar el horario.';
      },
    });
  }

  getDayLabel(day: DayOfWeek): string {
    const labels: Record<DayOfWeek, string> = {
      MONDAY: 'Lunes',
      TUESDAY: 'Martes',
      WEDNESDAY: 'Miercoles',
      THURSDAY: 'Jueves',
      FRIDAY: 'Viernes',
      SATURDAY: 'Sabado',
      SUNDAY: 'Domingo',
    };
    return labels[day];
  }

  getScheduleLabel(schedule: Schedule): string {
    if (schedule.is_closed) {
      return 'Cerrado';
    }

    const open = this.toDisplayTime(schedule.open_time);
    const close = this.toDisplayTime(schedule.close_time);
    if (!open || !close) {
      return 'Sin definir';
    }
    return `${open} - ${close}`;
  }

  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  private onSaved(message: string): void {
    this.isSaving = false;
    this.successMessage = message;
    this.cancelEdit();
    this.loadSchedules();
  }

  private onSaveError(error: unknown): void {
    const errorValue = error as { error?: { detail?: string } };
    this.isSaving = false;
    this.errorMessage = errorValue?.error?.detail || 'No se pudo guardar el horario.';
  }

  private buildPayload(): ScheduleWriteRequest | null {
    const dayOfWeek = this.scheduleForm.value.day_of_week as DayOfWeek;
    const isClosed = !!this.scheduleForm.value.is_closed;
    const openTime = String(this.scheduleForm.value.open_time || '').trim();
    const closeTime = String(this.scheduleForm.value.close_time || '').trim();

    if (!dayOfWeek) {
      return null;
    }

    if (isClosed) {
      return {
        day_of_week: dayOfWeek,
        is_closed: true,
        open_time: null,
        close_time: null,
      };
    }

    if (!openTime || !closeTime) {
      return null;
    }

    const openMinutes = this.timeToMinutes(openTime);
    const closeMinutes = this.timeToMinutes(closeTime);
    if (openMinutes === null || closeMinutes === null || openMinutes >= closeMinutes) {
      return null;
    }

    return {
      day_of_week: dayOfWeek,
      open_time: `${openTime}:00`,
      close_time: `${closeTime}:00`,
      is_closed: false,
    };
  }

  private sortSchedules(schedules: Schedule[]): Schedule[] {
    const order: Record<DayOfWeek, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };

    return [...schedules].sort((a, b) => order[a.day_of_week] - order[b.day_of_week]);
  }

  private timeToMinutes(time: string): number | null {
    const parts = time.split(':');
    if (parts.length < 2) {
      return null;
    }
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private toInputTime(timeValue?: string | null): string | null {
    if (!timeValue) {
      return null;
    }

    const parts = timeValue.split(':');
    if (parts.length < 2) {
      return null;
    }

    return `${parts[0]}:${parts[1]}`;
  }

  private toDisplayTime(timeValue?: string | null): string | null {
    const inputTime = this.toInputTime(timeValue);
    if (!inputTime) {
      return null;
    }
    return inputTime;
  }
}
