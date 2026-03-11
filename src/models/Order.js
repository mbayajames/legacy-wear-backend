const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    orderNumber: {
      type: String,
      unique: true,
    },
    orderItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        size: String,
        color: String,
        price: {
          type: Number,
          required: true,
        },
        image: String,
      },
    ],
    shippingAddress: {
      fullName: {
        type: String,
        required: true,
      },
      phoneNumber: {
        type: String,
        required: true,
      },
      addressLine1: {
        type: String,
        required: true,
      },
      addressLine2: String,
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      postalCode: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        required: true,
      },
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['card', 'mpesa', 'cod'],
    },
    paymentResult: {
      id: String,
      status: String,
      update_time: String,
      email_address: String,
    },
    itemsPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    discount: {
      type: Number,
      default: 0.0,
    },
    couponCode: String,
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: Date,
    isDelivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: Date,
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    notes: String,
    cancelReason: String,
    refundAmount: Number,
    refundReason: String,
  },
  {
    timestamps: true,
  }
);

// Generate unique order number
OrderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `LW${Date.now()}-${(count + 1).toString().padStart(5, '0')}`;
  }
  next();
});

// Calculate order summary
OrderSchema.methods.calculateOrderSummary = function () {
  this.itemsPrice = this.orderItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );
  
  // Tax calculation (16% VAT for Kenya)
  this.taxPrice = (this.itemsPrice * 0.16).toFixed(2);
  
  // Free shipping over 5000 KES
  this.shippingPrice = this.itemsPrice > 5000 ? 0 : 200;
  
  this.totalPrice = (
    parseFloat(this.itemsPrice) +
    parseFloat(this.taxPrice) +
    parseFloat(this.shippingPrice) -
    parseFloat(this.discount || 0)
  ).toFixed(2);
};

module.exports = mongoose.model('Order', OrderSchema);