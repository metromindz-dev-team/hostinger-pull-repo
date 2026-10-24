import mongoose from "mongoose";

const { Schema, model } = mongoose;

export const bannerSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true, default: "" },
    body: { type: String, trim: true, default: "" },
    kind: { type: String, enum: ["hero", "promo", "advertisement", "sidebar"], default: "hero" },
    placement: {
      type: String,
      enum: ["homepage", "after_hero", "after_category", "after_mega_deals", "sidebar"],
      default: "homepage",
      index: true,
    },
    layout: {
      type: String,
      enum: ["layout1", "layout2", "layout3", "imageOnly", "collage"],
      default: "layout1",
    },
    bgColor: { type: String, default: "#090d16" },
    textColor: { type: String, default: "#ffffff" },
    bgOpacity: { type: Number, min: 0, max: 1, default: 0.6 },
    ctaLabel: { type: String, default: "Shop Collection" },
    ctaUrl: { type: String, default: "/#products" },
    ctaBgColor: { type: String },
    ctaTextColor: { type: String },
    imageUrl: { type: String, default: "" },
    price: { type: Number, min: 0 },
    discountPrice: { type: Number, min: 0 },
    priceColor: { type: String, default: "#fbbf24" },
    bannerWidth: { type: Number, min: 1 },
    bannerHeight: { type: Number, min: 1 },
    slug: { type: String, trim: true },
    orientation: { type: String, enum: ["landscape", "portrait", "square"], default: "landscape" },
    imageFit: { type: String, enum: ["cover", "contain", "fill"], default: "cover" },
    imagePosition: { type: String, default: "center" },
    cropPositionX: { type: Number, default: 50 },
    cropPositionY: { type: Number, default: 50 },
    zoom: { type: Number, default: 1 },
    titleStyle: {
      color: String,
      fontFamily: String,
      fontSize: String,
      fontWeight: String,
    },
    subtitleStyle: {
      color: String,
      fontFamily: String,
      fontSize: String,
      fontWeight: String,
    },
    bodyStyle: {
      color: String,
      fontFamily: String,
      fontSize: String,
      fontWeight: String,
    },
    collageCols: { type: Number, default: 3 },
    collageRows: { type: Number },
    collageGapPx: { type: Number, default: 12 },
    collageItems: [
      {
        id: String,
        imageUrl: String,
        title: String,
        subtitle: String,
        ctaUrl: String,
        aspectRatio: String,
        gridSpan: Number,
        rowSpan: Number,
      },
    ],
    starts: { type: Date },
    ends: { type: Date },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

bannerSchema.index({ placement: 1, active: 1, sortOrder: 1 });

export const Banner = mongoose.models.Banner || model("Banner", bannerSchema);
export default Banner;
