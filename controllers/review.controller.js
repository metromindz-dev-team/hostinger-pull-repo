import { z } from "zod";
import { Review, Product, Order } from "../models/index.js";
import { fail } from "../utils/api.js";

export const reviewController = {
  async submitReview(req, res) {
    const isId = /^[a-f\d]{24}$/i.test(req.params.id);
    const lookup = isId
      ? { $or: [{ _id: req.params.id }, { slug: req.params.id }] }
      : { slug: req.params.id };

    const product = await Product.findOne({
      ...lookup,
      status: "active",
    });
    if (!product) throw fail(404, "Product not found");

    // Only allow customers who purchased this product to review
    const purchasedOrder = await Order.findOne({
      user: req.user._id,
      status: { $in: ["delivered", "processing", "shipped"] },
      "items.product": product._id,
    });
    if (!purchasedOrder) {
      throw fail(
        403,
        "You can only review products that you have purchased."
      );
    }

    const body = z
      .object({
        author: z.string().trim().max(100).optional(),
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().max(160).optional(),
        comment: z.string().trim().min(1).max(2000),
        images: z.array(z.string()).max(10).default([]),
        videoUrl: z.string().optional(),
      })
      .parse(req.body);

    const author =
      body.author ||
      req.user.fullName ||
      (req.user.email ? req.user.email.split("@")[0] : "") ||
      "Verified Customer";

    let review = await Review.findOne({
      product: product._id,
      user: req.user._id,
    });

    if (review) {
      review.author = author;
      review.rating = body.rating;
      review.title = body.title || "";
      review.comment = body.comment;
      review.images = body.images;
      review.videoUrl = body.videoUrl || "";
      review.status = "pending";
      await review.save();
    } else {
      review = await Review.create({
        product: product._id,
        user: req.user._id,
        author,
        rating: body.rating,
        title: body.title || "",
        comment: body.comment,
        images: body.images,
        videoUrl: body.videoUrl || "",
        status: "pending",
      });
    }

    // Recompute product rating & review count for approved reviews only
    const stats = await Review.aggregate([
      { $match: { product: product._id, status: "approved" } },
      {
        $group: {
          _id: "$product",
          rating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    if (stats[0]) {
      await Product.findByIdAndUpdate(product._id, {
        rating: Number(stats[0].rating.toFixed(1)),
        reviewCount: stats[0].reviewCount,
      });
    } else {
      await Product.findByIdAndUpdate(product._id, {
        rating: 0,
        reviewCount: 0,
      });
    }

    res.status(201).json({ review, message: "Review submitted for admin approval" });
  },
};

export default reviewController;
