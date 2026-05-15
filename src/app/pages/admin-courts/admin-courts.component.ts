import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Court } from '../../models';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-courts',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-courts.component.html',
  styleUrls: ['./admin-courts.component.css'],
})
export class AdminCourtsComponent implements OnInit {
  courts: Court[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  successMessage = '';

  courtForm!: FormGroup;
  editingCourtId: number | null = null;

  constructor(
    private readonly apiService: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.courtForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      is_active: [true],
    });

    this.loadCourts();
  }

  loadCourts(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getCourts().subscribe({
      next: (courts) => {
        this.courts = courts;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.detail || 'No se pudieron cargar las canchas.';
        this.cdr.detectChanges();
      },
    });
  }

  submitCourtForm(): void {
    if (this.courtForm.invalid) {
      this.courtForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    const payload = {
      name: String(this.courtForm.value.name).trim(),
      is_active: !!this.courtForm.value.is_active,
    };

    if (this.editingCourtId) {
      this.apiService.updateCourt(this.editingCourtId, payload).subscribe({
        next: () => {
          this.onSaved('Cancha actualizada correctamente.');
        },
        error: (error) => this.onSaveError(error),
      });
      return;
    }

    this.apiService.createCourt(payload).subscribe({
      next: () => {
        this.onSaved('Cancha creada correctamente.');
      },
      error: (error) => this.onSaveError(error),
    });
  }

  editCourt(court: Court): void {
    this.editingCourtId = court.id;
    this.successMessage = '';
    this.errorMessage = '';
    this.courtForm.patchValue({
      name: court.name,
      is_active: court.is_active ?? true,
    });
  }

  cancelEdit(): void {
    this.editingCourtId = null;
    this.courtForm.reset({ name: '', is_active: true });
  }

  deleteCourt(court: Court): void {
    const confirmed = confirm(`Eliminar ${court.name}? Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.apiService.deleteCourt(court.id).subscribe({
      next: () => {
        this.successMessage = 'Cancha eliminada correctamente.';
        this.loadCourts();
      },
      error: (error) => {
        this.errorMessage = error?.error?.detail || 'No se pudo eliminar la cancha.';
      },
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  private onSaved(message: string): void {
    this.isSaving = false;
    this.successMessage = message;
    this.cancelEdit();
    this.loadCourts();
  }

  private onSaveError(error: any): void {
    this.isSaving = false;
    this.errorMessage = error?.error?.detail || 'No se pudo guardar la cancha.';
  }
}
