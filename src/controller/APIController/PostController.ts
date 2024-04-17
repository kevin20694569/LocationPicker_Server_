import { Request, Response, NextFunction, query, request } from "express";
import ControllerBase from "../ControllerBase";
import fs from "fs";
import "dotenv/config";
import mongoose from "mongoose";
import multer, { Multer } from "multer";

class PostController extends ControllerBase {
  protected postMediaFolderString = "/public/media";

  public async getNearLocationPostsWithPublic(req: Request, res: Response, next: NextFunction) {
    let { latitude, longitude, distance, user_id } = req.query;
    user_id = user_id as string;
    try {
      let posts = await this.mongodbPostService.getRandomPublicPostsFromDistance(
        parseFloat(longitude as string),
        parseFloat(latitude as string),
        parseFloat(distance as string)
      );
      let json = {};
      if (posts.length > 0) {
        json = await this.mergeDataFromPosts(posts, user_id);
      }
      res.json(json);
      res.status(200);
    } catch (error) {
      console.log(error);
      res.status(404);
      res.send(error.message);
    } finally {
      res.end();
    }
  }

  public async getRestaurantPosts(req, res: Response, next: NextFunction) {
    try {
      let restaurant_id = req.params.id;
      let { date, user_id } = req.query;
      user_id = user_id as string;
      let dateObject = new Date();
      if (date) {
        dateObject = new Date(date);
      }
      let posts = await this.mongodbPostService.getRestaurantPostsFromRestaurantID(restaurant_id, dateObject);
      let json = await this.mergeDataFromPosts(posts, user_id);

      res.json(json);
      res.status(200);
    } catch (error) {
      res.status(404).send(error.message);
      console.log(error);
    } finally {
      res.end();
    }
  }

  public async getNearLocationPostsWithFriends(req, res: Response, next: NextFunction) {
    let { latitude, longitude, distance, request_user_id } = req.query;
    if (!distance) {
      distance = 0;
    }
    try {
      request_user_id = request_user_id as string;
      let friendResults = await this.neo4jFriendShipService.searchFriendsByUserID(request_user_id);

      let friend_ID_Array = friendResults.map((result) => {
        return result.friend.user_id;
      });

      let posts = await this.mongodbPostService.getNearLocationPostsFromFriendsByUserID(
        friend_ID_Array,
        parseFloat(distance),
        parseFloat(latitude),
        parseFloat(longitude)
      );
      let json = {};
      json = await this.mergeDataFromPosts(posts, request_user_id);
      res.json(json);
      res.status(200);
      res.end();
    } catch (error) {
      console.log(error);
      res.status(500);
      res.send(error.message);
      res.end();
    }
  }

  public async getFriendsPostsOrderByTime(req: Request, res: Response, next: NextFunction) {
    try {
      let { latitude, longitude, date, request_user_id } = req.query;
      request_user_id = request_user_id as string;
      let dateObject = new Date();
      if (date) {
        dateObject = new Date(date as string);
      }
      let results = await this.neo4jFriendShipService.searchFriendsByUserID(request_user_id);

      const frined_Ids = results.map((result) => {
        return result.friend.user_id;
      });
      let posts = await this.mongodbPostService.getFriendsPostByCreatedTime(
        frined_Ids,
        dateObject,
        parseFloat(longitude as string),
        parseFloat(latitude as string)
      );
      let json = await this.mergeDataFromPosts(posts, request_user_id);

      res.json(json);
      res.status(200);
    } catch (error) {
      res.status(404).send(error.message);
      console.log(error);
    } finally {
      res.end();
    }
  }

  public async getUserPosts(req, res: Response, next: NextFunction) {
    try {
      let user_id = req.params.id;
      let { date, request_user_id } = req.query;
      let dateObject = new Date();
      if (date) {
        dateObject = new Date(date);
      }
      let posts = await this.mongodbPostService.getPostsByUserID(user_id, dateObject);
      let json = await this.mergeDataFromPosts(posts, user_id);
      res.json(json);
      res.status(200);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  public async getSinglePost(req: Request, res: Response, next: NextFunction) {
    try {
      let id = req.params.id;
      let { request_user_id } = req.query;
      request_user_id = request_user_id as string;
      let posts = await this.mongodbPostService.getPostFromID(id);
      let data = await this.mergeDataFromPosts(posts, request_user_id);
      let json = data[0];
      res.json(json);
    } catch (error) {
      res.status(404).send(error.message);
      console.log(error);
    } finally {
      res.end();
    }
  }

  public async uploadPost(req, res: Response, next: NextFunction) {
    try {
      let { user_id, title, content, media_titles, restaurant_id, grade, socket_id } = req.body;
      let media_titles_array: string[] = media_titles;
      if (typeof media_titles === "string") {
        media_titles_array = JSON.parse(media_titles);
      }
      let { latitude, longitude } = await this.mysqlRestaurantsTableService.findRestaurantID(restaurant_id, grade);
      let files = req.files;
      if (files == undefined) {
        throw new Error("沒有選擇檔案上傳");
      }
      let media = files.map((file: Express.Multer.File, index: number) => {
        const filename = `${file.filename}`;
        if (media_titles_array[index] == "") {
          media_titles_array[index] = null;
        }
        let model: { resource_id: string; title: any; _id: null };
        model = {
          resource_id: filename,
          title: media_titles_array[index],
          _id: null,
        };
        return model;
      });

      const location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };

      await this.mongodbPostService.insertPost(title, content, media, user_id, location, restaurant_id, grade);
      await this.mysqlRestaurantsTableService.updateRestaurantAverage_GradeWithInputGrade(restaurant_id, grade as number);
      await this.mysqlRestaurantsTableService.updateRestaurantPostsCountWithInput(restaurant_id, 1);
      await this.mysqlUsersTableService.modifyUserPostsCount(user_id, 1);
      if (req.ioService) {
        req.ioService.emitUploadTaskFinished(socket_id, true);
      }
      res.status(200).json("上傳成功");
    } catch (error) {
      console.log(error);
      await this.deletePost(error, req, res, next);
    } finally {
      res.end();
    }
  }

  public async deletePost(err: Error, req, res: Response, next: NextFunction) {
    let { socket_id, post_id } = req.json;
    await this.mongodbPostService.deletePost(post_id);
    req.files.forEach((file: Express.Multer.File) => {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error("刪除檔案出錯：", err);
          return;
        }
        console.log("檔案刪除成功");
      });
    });
    if (req.ioService) {
      req.ioService.emitUploadTaskFinished(socket_id, false);
    }
    res.status(500).json({ message: "Internal server error" });
    res.end();
  }

  protected async mergeDataFromPosts(posts: any[], request_user_id: string) {
    if (posts.length < 1) {
      return [];
    }
    try {
      if (posts.length == 0) {
        return [];
      }
      let post_ids: string[] = [];
      let users_ids: string[] = [];
      let restaurant_ids = posts.map((post) => {
        let post_ObID: mongoose.Types.ObjectId = post.id;

        let post_id = post_ObID.toHexString();
        post_ids.push(post_id);
        users_ids.push(post.user_id);
        return post.restaurant_id;
      });
      let restaurants = await this.mysqlRestaurantsTableService.getRestaurantsDetail(restaurant_ids);
      let users = await this.mysqlUsersTableService.getUserByIDs(users_ids);
      let friends = await this.neo4jFriendShipService.searchFriendsByUserID(request_user_id);
      let friends_id = friends.map((friend) => {
        return friend.user_ID;
      });
      let selfReactions = await this.mongodbReactionService.getManyPostsSelfReaction(post_ids, request_user_id);
      let publicReactions = await this.mongodbReactionService.getPostsPublicReactions(post_ids, request_user_id, friends_id);
      let json = this.mergePostJsonProperties(posts, users, restaurants, selfReactions, publicReactions);
      return json;
    } catch (error) {
      throw error;
    }
  }

  async mergePostJsonProperties(posts: any[], users: any[], restaurants: any[], reactions: any[], publicReactions: any[]) {
    let usersMap = {};
    let restaurantsMap = {};
    let selfReactionsMap = {};
    let publicReactionsMap = {};
    users.forEach((user: { id: string }) => {
      usersMap[`${user.id}`] = user;
    });
    restaurants.forEach((restaurant) => {
      restaurantsMap[`${restaurant.id}`] = restaurant;
    });
    if (publicReactions) {
      publicReactions.forEach((reaction: { post_id: any }) => {
        publicReactionsMap[`${reaction.post_id}`] = reaction;
      });
    }

    if (reactions) {
      reactions.forEach((reaction: { post_id: any }) => {
        selfReactionsMap[`${reaction.post_id}`] = reaction;
      });
    }

    let result = posts.map((post: { id; user_id: string | number; restaurant_id: string | number }) => {
      let post_id = post.id.toHexString();
      let user = usersMap[post.user_id];
      let restaurant = restaurantsMap[post.restaurant_id];
      let selfReaction = selfReactionsMap[post_id];
      let publicReactions = publicReactionsMap[post_id];
      /* if (selfReaction) {
        selfReaction = selfReaction;
      }*/
      if (publicReactions) {
        publicReactions = publicReactions.reactions;
      }
      let json = {
        postDetail: post,
        user: user,
        restaurant: restaurant,
        selfReaction: selfReaction,
        publicReactions: publicReactions,
      };
      return json;
    });
    return result;
  }
}

export default PostController;
