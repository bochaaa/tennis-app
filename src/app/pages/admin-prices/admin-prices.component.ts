import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Price, PriceWriteRequest } from '../../models';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-admin-prices',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-prices.component.html',
  styleUrls: ['./admin-prices.component.css'],
})
export class AdminPricesComponent implements OnInit {
  readonly gameModes: Array<'SINGLES' | 'DOUBLES'> = ['SINGLES', 'DOUBLES'];
  readonly playerTypes: Array<'MEMBER' | 'NON_MEMBER'> = ['MEMBER', 'NON_MEMBER'];

  prices: Price[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  successMessage = '';

  priceForm!: FormGroup;
  editingPriceId: number | null = null;

  constructor(
    private readonly apiService: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.priceForm = this.formBuilder.group({
      game_mode: ['SINGLES', Validators.required],
      player_type: ['MEMBER', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
    });

    this.loadPrices();
  }

  loadPrices(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getPrices().subscribe({
      next: (prices) => {
        this.prices = this.sortPrices(prices);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.detail || 'No se pudieron cargar los precios.';
        this.cdr.detectChanges();
      },
    });
  }

  submitPriceForm(): void {
    if (this.priceForm.invalid) {
      this.priceForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    const payload = this.buildPayload();
    if (!payload) {
      this.isSaving = false;
      this.errorMessage = 'Precio invalido.';
      return;
    }

    if (this.editingPriceId) {
      this.apiService.updatePrice(this.editingPriceId, payload).subscribe({
        next: () => this.onSaved('Precio actualizado correctamente.'),
        error: (error) => this.onSaveError(error),
      });
      return;
    }

    this.apiService.createPrice(payload).subscribe({
      next: () => this.onSaved('Precio creado correctamente.'),
      error: (error) => this.onSaveError(error),
    });
  }

  editPrice(price: Price): void {
    this.editingPriceId = price.id;
    this.successMessage = '';
    this.errorMessage = '';
    this.priceForm.patchValue({
      game_mode: price.game_mode,
      player_type: price.player_type,
      price: price.price,
    });
  }

  cancelEdit(): void {
    this.editingPriceId = null;
    this.priceForm.reset({
      game_mode: 'SINGLES',
      player_type: 'MEMBER',
      price: 0,
    });
  }

  deletePrice(price: Price): void {
    const confirmed = confirm(
      `Eliminar precio ${this.getGameModeLabel(price.game_mode)} - ${this.getPlayerTypeLabel(price.player_type)}?`,
    );
    if (!confirmed) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.apiService.deletePrice(price.id).subscribe({
      next: () => {
        this.successMessage = 'Precio eliminado correctamente.';
        this.loadPrices();
      },
      error: (error) => {
        this.errorMessage = error?.error?.detail || 'No se pudo eliminar el precio.';
      },
    });
  }

  getGameModeLabel(mode: 'SINGLES' | 'DOUBLES'): string {
    return mode === 'SINGLES' ? 'Singles' : 'Dobles';
  }

  getPlayerTypeLabel(type: 'MEMBER' | 'NON_MEMBER'): string {
    return type === 'MEMBER' ? 'Socio' : 'No socio';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(value);
  }

  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  private onSaved(message: string): void {
    this.isSaving = false;
    this.successMessage = message;
    this.cancelEdit();
    this.loadPrices();
  }

  private onSaveError(error: unknown): void {
    const errorValue = error as { error?: { detail?: string } };
    this.isSaving = false;
    this.errorMessage = errorValue?.error?.detail || 'No se pudo guardar el precio.';
  }

  private buildPayload(): PriceWriteRequest | null {
    const gameMode = this.priceForm.value.game_mode as 'SINGLES' | 'DOUBLES';
    const playerType = this.priceForm.value.player_type as 'MEMBER' | 'NON_MEMBER';
    const price = Number(this.priceForm.value.price);

    if (!gameMode || !playerType || Number.isNaN(price) || price < 0) {
      return null;
    }

    return {
      game_mode: gameMode,
      player_type: playerType,
      price,
    };
  }

  private sortPrices(prices: Price[]): Price[] {
    const gameModeOrder: Record<'SINGLES' | 'DOUBLES', number> = {
      SINGLES: 1,
      DOUBLES: 2,
    };
    const playerTypeOrder: Record<'MEMBER' | 'NON_MEMBER', number> = {
      MEMBER: 1,
      NON_MEMBER: 2,
    };

    return [...prices].sort((a, b) => {
      const gameCompare = gameModeOrder[a.game_mode] - gameModeOrder[b.game_mode];
      if (gameCompare !== 0) {
        return gameCompare;
      }
      return playerTypeOrder[a.player_type] - playerTypeOrder[b.player_type];
    });
  }
}
