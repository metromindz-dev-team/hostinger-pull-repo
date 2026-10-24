import { Product, Order, User, Review } from "../../models/index.js";

export const adminAnalyticsController = {
  async getDashboardSummary(_req, res) {
    const [products, orders, customers, pendingReviews, revenue] =
      await Promise.all([
        Product.countDocuments(),
        Order.countDocuments(),
        User.countDocuments({ role: "customer" }),
        Review.countDocuments({ status: "pending" }),
        Order.aggregate([
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
      ]);

    res.json({
      products,
      orders,
      customers,
      pendingReviews,
      revenue: revenue[0]?.total || 0,
    });
  },

  async getAnalyticsReport(_req, res) {
    const since = new Date(Date.now() - 30 * 86400000);
    const [sales, orderCount, customers, topProducts] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: since }, paymentStatus: "paid" } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$total" },
            averageOrderValue: { $avg: "$total" },
          },
        },
      ]),
      Order.countDocuments({ createdAt: { $gte: since } }),
      User.countDocuments({ role: "customer", createdAt: { $gte: since } }),
      Order.aggregate([
        { $unwind: "$items" },
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: { $multiply: ["$items.quantity", "$items.unitPrice"] },
            },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({
      period: "30d",
      revenue: sales[0]?.revenue || 0,
      averageOrderValue: sales[0]?.averageOrderValue || 0,
      orderCount,
      newCustomers: customers,
      topProducts,
    });
  },
};

export default adminAnalyticsController;
