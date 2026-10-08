const router = require('express').Router();
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth');
const Product = require('../models/Product');
const Sale = require('../models/Sale');

router.use(requireAuth);

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

router.get('/', async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const today = startOfDay();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 29);

    const [productStats, lowStock, todaySales, weekSales, monthSales, bestSellers] = await Promise.all([
      Product.aggregate([
        { $match: { userId } },
        { $group: { _id: null, totalProducts: { $sum: 1 }, totalStock: { $sum: '$stock' } } },
      ]),
      Product.find({ userId, $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
        .sort({ stock: 1 })
        .limit(10),
      Sale.aggregate([
        { $match: { userId, createdAt: { $gte: today } } },
        { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { userId, createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { userId, createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { userId, createdAt: { $gte: monthAgo } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.productName' },
            unitsSold: { $sum: '$items.quantity' },
          },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: 5 },
      ]),
    ]);

    // daily revenue for the trailing 7 days, used for the dashboard chart
    const dailyBuckets = await Sale.aggregate([
      { $match: { userId, createdAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: process.env.TZ || 'Asia/Kolkata' } },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalProducts: productStats[0]?.totalProducts || 0,
      totalStock: productStats[0]?.totalStock || 0,
      lowStockProducts: lowStock,
      today: { revenue: todaySales[0]?.revenue || 0, sales: todaySales[0]?.count || 0 },
      weekly: { revenue: weekSales[0]?.revenue || 0, sales: weekSales[0]?.count || 0 },
      monthly: { revenue: monthSales[0]?.revenue || 0, sales: monthSales[0]?.count || 0 },
      bestSellers,
      dailyRevenue: dailyBuckets,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
