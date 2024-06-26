import { Request, Response, NextFunction } from "express";
import ControllerBase from "../ControllerBase";

class ReactionController extends ControllerBase {
  protected postMediaFolderString = process.env.serverip + "/public/media";

  async getPostReactions(req: Request, res: Response, next: NextFunction) {
    const post_id = req.params.id;
    let { request_user_id, date } = req.query;
    request_user_id = request_user_id as string;
    let dateObject: Date = new Date();
    if (date) {
      dateObject = new Date(date as string);
    }

    let results = await this.neo4jFriendShipService.searchFriendsByUserID(request_user_id);

    let friends_ids = results.map((result) => {
      return result.friend.user_ID;
    });
    let reactions = await this.mongodbReactionService.getPostReactions(post_id, request_user_id, friends_ids, dateObject);
    res.status(200);
    res.json(reactions);
    res.end();
  }

  async updateReaction(req: Request, res: Response, next: NextFunction) {
    let post_id = req.params.id;
    let { user_id, reaction, liked } = req.body;

    try {
      await this.mongodbReactionService.updateReaction(post_id, user_id, liked as boolean, reaction);
      res.status(200);
      res.send("updateReaction成功");
    } catch (error) {
      console.log(error);
      res.status(404);
      res.send("updateReaction失敗");
    } finally {
      res.end();
    }
  }
}

export default ReactionController;
