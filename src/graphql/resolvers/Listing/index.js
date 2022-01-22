"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listingResolvers = void 0;
const types_1 = require("../../../lib/types");
const utils_1 = require("./../../../lib/utils");
const api_1 = require("./../../../lib/api");
const types_2 = require("./types");
const mongodb_1 = require("mongodb");
const verifyHostListingInput = ({ title, description, type, price, }) => {
    if (title.length > 100) {
        throw new Error("listing title must be under 100 characters");
    }
    if (description.length > 5000) {
        throw new Error("listing description must be under 5000 characters");
    }
    if (type !== types_1.ListingType.Apartment && type !== types_1.ListingType.House) {
        throw new Error("listing type must be either an apartment or house");
    }
    if (price < 0) {
        throw new Error("price must be greater than 0");
    }
};
exports.listingResolvers = {
    Query: {
        listing: (_root, { id }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const listing = yield db.listings.findOne({ _id: new mongodb_1.ObjectId(id) });
                if (!listing) {
                    throw new Error("listing can't be found.");
                }
                const viewer = yield (0, utils_1.authorize)(db, req);
                if ((viewer === null || viewer === void 0 ? void 0 : viewer._id) === listing.host) {
                    listing.authorize = true;
                }
                return listing;
            }
            catch (error) {
                throw new Error(`Failed to query listing ${error}`);
            }
        }),
        listings: (_root, { location, filter, page, limit }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            const query = {};
            try {
                const data = {
                    total: 0,
                    result: [],
                    region: null,
                };
                if (location) {
                    const { country, admin, city } = yield api_1.Google.geocode(location);
                    if (city)
                        query.city = city;
                    if (admin)
                        query.admin = admin;
                    if (country) {
                        query.country = country;
                    }
                    else {
                        throw new Error("no country found");
                    }
                    const cityText = city ? `${city}, ` : "";
                    const adminText = admin ? `${admin}, ` : "";
                    data.region = `${cityText}${adminText}${country}`;
                }
                let cursor = db.listings.find(query);
                data.total = yield cursor.count();
                if (filter && filter === types_2.ListingsFilter.PRICE_LOW_TO_HIGH) {
                    cursor = cursor.sort({ price: 1 });
                }
                if (filter && filter === types_2.ListingsFilter.PRICE_HIGH_TO_LOW) {
                    cursor = cursor.sort({ price: -1 });
                }
                cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
                cursor = cursor.limit(limit);
                data.result = yield cursor.toArray();
                return data;
            }
            catch (error) {
                throw new Error(`Failed to query listings: ${error}`);
            }
        }),
    },
    Mutation: {
        hostListing: (_root, { input }, { db, req }) => __awaiter(void 0, void 0, void 0, function* () {
            verifyHostListingInput(input);
            const viewer = yield (0, utils_1.authorize)(db, req);
            if (!viewer) {
                throw new Error("viewer cannot be found");
            }
            const { country, admin, city } = yield api_1.Google.geocode(input.address);
            if (!country || !admin || !city) {
                throw new Error("invalid address input");
            }
            const imageUrl = yield api_1.Cloudinary.upload(input.image);
            const insertedId = new mongodb_1.ObjectId();
            const newListing = Object.assign(Object.assign({ _id: insertedId }, input), { image: imageUrl, bookings: [], bookingsIndex: {}, country,
                admin,
                city, host: viewer._id });
            yield db.listings.insertOne(newListing);
            yield db.users.updateOne({ _id: viewer._id }, { $push: { listings: insertedId } });
            return newListing;
        })
    },
    Listing: {
        id: (listing) => {
            return listing._id.toString();
        },
        host: (listing, _args, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            const host = yield db.users.findOne({ _id: listing.host });
            if (!host) {
                throw new Error("host can't be found.");
            }
            return host;
        }),
        bookingsIndex: (listing) => {
            return JSON.stringify(listing.bookingsIndex);
        },
        bookings: (listing, { limit, page }, { db }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                if (!listing.authorize) {
                    return null;
                }
                const data = {
                    total: 0,
                    result: [],
                };
                let cursor = db.bookings.find({
                    _id: { $in: listing.bookings },
                });
                data.total = yield cursor.count();
                cursor = cursor.skip(page > 0 ? (page - 1) * limit : 0);
                cursor = cursor.limit(limit);
                data.result = yield cursor.toArray();
                return data;
            }
            catch (error) {
                throw new Error(`Failed to query listing bookings: ${error}`);
            }
        })
    }
};
