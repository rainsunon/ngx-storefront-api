import {
  Controller,
  Post,
  Body,
  Query,
  HttpException,
  Get,
  Param,
  NotFoundException,
  Delete,
  UseGuards,
  Patch,
} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Review} from '@app/schema/review.schema';
import {Model} from 'mongoose';
import {Product} from '@app/schema/product.schema';
import {AuthGuard} from '@nestjs/passport';
import {InternalException} from '@app/common/internal.exception';
import {reviewDto, reviewEditDto, reviewModel, reviewGetAllDto} from './review.types';

@Controller('review')
export class ReviewController {
  constructor(
    @InjectModel(Review.name) private reviewModel: reviewModel,
    @InjectModel(Product.name) private productModel: Model<Product>
  ) {}

  @Post()
  async create(@Body() req: reviewDto) {
    const review = await this.reviewModel.create(req);
    if (!review) {
      throw new InternalException();
    }
    const product = await this.productModel
      .findById(review.productId)
      .select('name rating ratingCount')
      .exec();

    if (!product) {
      throw new InternalException();
    }
    product.ratingCount = product.ratingCount ? product.ratingCount : 0;
    product.ratingCount++;

    const reviewsForProduct = await this.reviewModel
      .find({productId: review.productId})
      .lean()
      .exec();

    let currentRatingTotal = 0;
    for (const r of reviewsForProduct) {
      if (r.rating) {
        currentRatingTotal += r.rating;
      }
    }
    product.rating = currentRatingTotal / product.ratingCount;

    review.productName = product.name;
    await review.save();

    await product.save();
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async edit(@Body() req: reviewEditDto, @Param('id') id: string) {
    const review = await this.reviewModel.findById(id).exec();

    if (!review) {
      throw new NotFoundException();
    }

    const updResult = await this.reviewModel.findByIdAndUpdate(id, req, {new: true});
    if (!updResult) {
      throw new InternalException();
    }
    return updResult._id;
  }

  @Get('')
  @UseGuards(AuthGuard('jwt'))
  async getAll(@Query() query: reviewGetAllDto): Promise<any> {
    let paginationConfig = {};
    if (!query.page) {
      paginationConfig = {
        limit: 5,
        page: 1,
      };
    } else {
      paginationConfig = {
        limit: query.limit,
        page: query.page,
      };
    }

    let search = {};
    let searchStr;
    if (query.search) {
      searchStr = `${query.search}`;
      search = {
        $or: [
          {
            authorName: new RegExp(searchStr, 'i'),
          },
          {
            authorEmail: new RegExp(searchStr, 'i'),
          },
          {
            content: new RegExp(searchStr, 'i'),
          },
        ],
      };
    }

    const itemsPaginate = await this.reviewModel.paginate(search, {
      ...paginationConfig,
      select: '-reviews',
      sort: {[query.sortType]: query.sortOrder},
    });

    const {total, limit, page, pages, docs} = itemsPaginate;
    return {items: docs, total, limit, page, pages};
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getOne(@Param('id') id: string): Promise<Review> {
    const result = await this.reviewModel.findById(id).exec();
    if (!result) {
      throw new NotFoundException();
    }
    return result;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async delete(@Param('id') id: string): Promise<void> {
    const result = await this.reviewModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException();
    }
  }
}
