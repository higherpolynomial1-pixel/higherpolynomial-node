const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: 'rzp_test_f4YO21eBMh0goz', // Replace with your Razorpay Key ID
  key_secret: 'iMuf33WYsBGFSNBGn9OOkrmz', // Replace with your Razorpay Key Secret
});

module.exports = razorpay;