import { storage } from "../storage";

export class PaymentService {
  /**
   * Disburse via UPI VPA. PAYMENT_PROVIDER=mock (default) records completion locally.
   */
  async disburse(opts: {
    claimId: number;
    amount: number;
    upiVpa?: string;
  }): Promise<{ success: boolean; transactionId?: string; mode: string }> {
    const mode = process.env.PAYMENT_PROVIDER || "mock";
    const transactionId = `UPI${Date.now()}`;
    const payment = await storage.createPayment({
      claimId: opts.claimId,
      amount: opts.amount.toString(),
      bankAccount: "****7890",
      ifscCode: "SBIN0001234",
      transactionId,
      status: mode === "mock" ? "completed" : "processing",
      paymentMethod: "upi",
      upiVpa: opts.upiVpa || null,
      disbursementMode: "upi",
    });
    if (mode === "mock") {
      await storage.updatePayment(payment.id, {
        status: "completed",
        completedAt: new Date(),
      });
    }
    return { success: true, transactionId, mode };
  }

  // Mock payment processing
  async processPayment(paymentId: number): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> {
    try {
      const payment = await storage.getPaymentsByClaim(0).then(payments => 
        payments.find(p => p.id === paymentId)
      );
      
      if (!payment) {
        return { success: false, error: "Payment not found" };
      }
      
      // Update payment status to processing
      await storage.updatePayment(paymentId, {
        status: "processing"
      });
      
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 98% success rate
      const success = Math.random() > 0.02;
      
      if (success) {
        const transactionId = `TXN${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        await storage.updatePayment(paymentId, {
          status: "completed",
          transactionId,
          completedAt: new Date(),
        });
        
        return { success: true, transactionId };
      } else {
        await storage.updatePayment(paymentId, {
          status: "failed"
        });
        
        return { success: false, error: "Payment processing failed" };
      }
      
    } catch (error) {
      console.error("Payment processing error:", error);
      
      await storage.updatePayment(paymentId, {
        status: "failed"
      });
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }
  
  // Initiate refund
  async initiateRefund(paymentId: number, reason: string): Promise<{
    success: boolean;
    refundId?: string;
    error?: string;
  }> {
    try {
      // Mock refund processing
      const refundId = `REF${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // In production, this would integrate with actual payment gateway
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        success: true,
        refundId,
      };
      
    } catch (error) {
      console.error("Refund error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Refund failed"
      };
    }
  }
  
  // Get payment status
  async getPaymentStatus(transactionId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
    amount?: number;
    timestamp?: Date;
  }> {
    try {
      // Mock payment status lookup
      return {
        status: 'completed',
        amount: Math.floor(Math.random() * 50000) + 10000,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error("Payment status error:", error);
      return { status: 'failed' };
    }
  }
  
  // Validate bank account details
  async validateBankAccount(accountNumber: string, ifscCode: string): Promise<{
    valid: boolean;
    bankName?: string;
    branchName?: string;
    error?: string;
  }> {
    try {
      // Mock bank validation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simple validation
      if (accountNumber.length < 9 || accountNumber.length > 18) {
        return {
          valid: false,
          error: "Invalid account number length"
        };
      }
      
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
        return {
          valid: false,
          error: "Invalid IFSC code format"
        };
      }
      
      // Mock successful validation
      return {
        valid: true,
        bankName: "State Bank of India",
        branchName: "Main Branch",
      };
      
    } catch (error) {
      console.error("Bank validation error:", error);
      return {
        valid: false,
        error: "Validation service unavailable"
      };
    }
  }
  
  // Generate payment receipt
  async generateReceipt(paymentId: number): Promise<{
    receiptNumber: string;
    receiptUrl?: string;
    error?: string;
  }> {
    try {
      const receiptNumber = `RCP${Date.now()}-${paymentId}`;
      
      // In production, this would generate actual PDF receipt
      const receiptUrl = `/api/receipts/${receiptNumber}.pdf`;
      
      return {
        receiptNumber,
        receiptUrl,
      };
      
    } catch (error) {
      console.error("Receipt generation error:", error);
      return {
        receiptNumber: "",
        error: "Failed to generate receipt"
      };
    }
  }
  
  // Calculate processing fees
  calculateProcessingFee(amount: number): number {
    // Mock fee calculation (1% of amount, minimum ₹10, maximum ₹100)
    const fee = Math.max(10, Math.min(100, amount * 0.01));
    return Math.round(fee);
  }
  
  // Check payment limits
  checkPaymentLimits(amount: number): {
    withinLimits: boolean;
    dailyLimit?: number;
    monthlyLimit?: number;
    error?: string;
  } {
    const dailyLimit = 100000; // ₹1 lakh
    const monthlyLimit = 500000; // ₹5 lakh
    
    if (amount > dailyLimit) {
      return {
        withinLimits: false,
        dailyLimit,
        error: "Amount exceeds daily limit"
      };
    }
    
    return {
      withinLimits: true,
      dailyLimit,
      monthlyLimit,
    };
  }
}

export const paymentService = new PaymentService();
