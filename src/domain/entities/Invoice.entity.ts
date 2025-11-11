/**
 * Invoice.entity.ts
 * Domain entity with business logic
 * This is the core of our domain - independent of frameworks
 */

export interface IVendor {
  name: string;
  taxId: string; // Required: valid CUIT or "No figura"
  cvu?: string;
  address?: string;
}

export interface IInvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ITaxes {
  iva: number;
  otherTaxes: number;
}

export interface IMetadata {
  processedAt: string;
  processingTimeMs: number;
  confidence: 'high' | 'medium' | 'low';
  model?: string;
}

export interface IInvoiceProps {
  invoiceNumber: string;
  date: string;
  operationType?: string;
  vendor: IVendor;
  totalAmount: number;
  currency: string;
  receiverBank?: string;
  items: IInvoiceItem[];
  taxes?: ITaxes;
  paymentMethod?: string;
  metadata: IMetadata;
}

/**
 * Invoice Entity with business logic
 */
export class Invoice {
  private props: IInvoiceProps;

  constructor(props: IInvoiceProps) {
    this.validateProps(props);
    this.props = props;
  }

  // Getters
  get invoiceNumber(): string {
    return this.props.invoiceNumber;
  }

  get date(): string {
    return this.props.date;
  }

  get operationType(): string | undefined {
    return this.props.operationType;
  }

  get vendor(): IVendor {
    return { ...this.props.vendor };
  }

  get totalAmount(): number {
    return this.props.totalAmount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get receiverBank(): string | undefined {
    return this.props.receiverBank;
  }

  get items(): IInvoiceItem[] {
    return [...this.props.items];
  }

  get taxes(): ITaxes | undefined {
    return this.props.taxes ? { ...this.props.taxes } : undefined;
  }

  get paymentMethod(): string | undefined {
    return this.props.paymentMethod;
  }

  get metadata(): IMetadata {
    return { ...this.props.metadata };
  }

  // Business logic methods

  /**
   * Calculate total amount including taxes
   */
  getTotalWithTaxes(): number {
    if (!this.props.taxes) {
      return this.props.totalAmount;
    }
    return this.props.totalAmount + this.props.taxes.iva + this.props.taxes.otherTaxes;
  }

  /**
   * Get formatted date in DD/MM/YYYY
   */
  getFormattedDate(): string {
    const [year, month, day] = this.props.date.split('-');
    return `${day}/${month}/${year}`;
  }

  /**
   * Check if invoice is high confidence
   */
  isHighConfidence(): boolean {
    return this.props.metadata.confidence === 'high';
  }

  /**
   * Get formatted currency amount
   */
  getFormattedAmount(): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: this.props.currency,
      minimumFractionDigits: 2,
    }).format(this.props.totalAmount);
  }

  /**
   * Convert to plain object (for serialization)
   */
  toObject(): IInvoiceProps {
    return {
      ...this.props,
      vendor: { ...this.props.vendor },
      items: [...this.props.items],
      taxes: this.props.taxes ? { ...this.props.taxes } : undefined,
      metadata: { ...this.props.metadata },
    };
  }

  /**
   * Validate invoice properties
   */
  private validateProps(props: IInvoiceProps): void {
    if (!props.invoiceNumber || props.invoiceNumber.trim().length === 0) {
      throw new Error('Invoice number is required');
    }

    if (!props.date || !/^\d{4}-\d{2}-\d{2}$/.test(props.date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    if (!props.vendor || !props.vendor.name) {
      throw new Error('Vendor name is required');
    }

    if (props.totalAmount <= 0) {
      throw new Error('Total amount must be positive');
    }

    if (!props.currency || props.currency.length !== 3) {
      throw new Error('Currency must be a 3-letter ISO code');
    }

    if (!props.items || props.items.length === 0) {
      throw new Error('Invoice must have at least one item');
    }
  }

  /**
   * Factory method to create Invoice from raw data
   */
  static create(props: IInvoiceProps): Invoice {
    return new Invoice(props);
  }
}

