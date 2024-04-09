import MySQLTableControllerBase from "./MySQLTableServiceBase";
import GoogleMapAPIService from "../GoogleMapAPI/GoogleMapAPIService";
import MongoDBBusiness_TimeService from "../MongoDB/MongoDBBusinessTimeService";

class MySQLRestaurantsTableService extends MySQLTableControllerBase {
  protected restaurantImageIP = this.serverIP + "/restaurantimage/";
  protected selectString = `CONCAT("${this.restaurantImageIP}", restaurant_id, ".jpg") AS restaurant_imageurl`;
  protected googleMapAPIService = new GoogleMapAPIService();
  protected business_TimeService = new MongoDBBusiness_TimeService();
  constructor(password?: string) {
    super(password);
  }

  async findRestaurantID(restaurant_ID: String, firstGrade?: number) {
    try {
      await this.getConnection();

      let query = `select * from restaurants where restaurant_id = ?;`;
      let params = [restaurant_ID];
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query, params);

      let restaurantDetail;
      if (results.length < 1) {
        let restaurant = await this.restaurantsearchfromgoogleByID(restaurant_ID);
        let { place_id, lat, lng, photos, opening_hours } = restaurant;
        if (place_id == null) {
          throw new Error("找不到地點");
        }
        if (opening_hours == undefined) {
          opening_hours = null;
        }
        let { photo_reference } = photos[0];
        await this.googleMapAPIService.downloadPhoto(photo_reference, place_id);
        let [results, fields] = await this.createnewrestaurant(restaurant, firstGrade);

        await this.business_TimeService.insertBusinessTime(place_id, opening_hours);
        restaurantDetail = {
          restaurant_id: place_id,
          restaurant_latitude: lat,
          restaurant_longitude: lng,
        };
      } else {
        restaurantDetail = results[0];
      }
      let business_time = await this.business_TimeService.getPlaceBusinessTimes(restaurant_ID);
      let json = {
        ...restaurantDetail,
      };
      if (business_time) {
        json = {
          ...json,
          ...business_time["_doc"],
        };
      }
      return json;
    } catch (error) {
      await this.deleteRestaurant(restaurant_ID);
      throw error;
    } finally {
      this.release();
    }
  }

  async updateRestaurantAverage_GradeWithInputGrade(restaurant_id: String, input_grade: Number) {
    await this.getConnection();
    let query = `UPDATE restaurants
    SET average_grade = (average_grade * posts_count + ?) / (posts_count + 1)
    WHERE restaurant_id = ?;`;
    let params = [input_grade, restaurant_id];
    let results: any[];
    let fields: any;
    [results, fields] = await this.connection.query(query, params);
  }

  async updateRestaurantPostsCountWithInput(restaurant_id: String, increaseCount: Number) {
    let query = `update restaurants set posts_count = posts_count + ? where restaurant_id = ?`;
    let params = [increaseCount, restaurant_id];
    let results: any[];
    let fields: any;
    [results, fields] = await this.connection.query(query, params);
  }

  async updateRestaurantPostsCount(restaurant_id: String, posts_count: Number) {
    let query = `update restaurants set posts_count = ? where restaurant_id = ?`;
    let params = [posts_count, restaurant_id];
    let results: any[];
    let fields: any;
    [results, fields] = await this.connection.query(query, params);
    if (results.length < 1) {
      throw new Error("updateRestaurantPostsCount錯誤");
    }
  }

  async getrestaurantDistanceAndDetail(restaurant_id: String, lat?: Number, lng?: Number) {
    try {
      await this.getConnection();

      let query = `select *, ST_DISTANCE(POINT(restaurants.restaurant_longitude, restaurants.restaurant_latitude), POINT(?, ?)) AS distance, ${this.selectString}  from restaurants where restaurants.restaurant_id = ?;`;
      var params = [lng ?? 0, lat ?? 0, restaurant_id];
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query, params);
      let restaurant = results[0];
      this.translateBool(restaurant);
      if (results.length > 0) {
        return results[0];
      } else {
        throw new Error("找不到餐廳");
      }
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }

  async updateRestaurant(restaurant) {
    try {
      let { place_id, name, formatted_address, lat, lng, takeout, reservable, price_level, website, formatted_phone_number } = restaurant;
      await this.getConnection();
      let query = `update restaurants set restaurant_name = ?, restaurant_address = ?, restaurant_latitude = ?, restaurant_longitude = ?, takeout = ?, reservable = ?, price_level = ?, website = ?, formatted_phone_number = ? where restaurant_id = ? ;`;
      let params = [name, formatted_address, lat, lng, takeout, reservable, price_level, website, formatted_phone_number, place_id];
      let results: any[];
      let fields: any;

      [results, fields] = await this.connection.query(query, params);
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }

  async createnewrestaurant(restaurant, grade: Number) {
    let { place_id, name, formatted_address, lat, lng, takeout, reservable, price_level, website, formatted_phone_number } = restaurant;
    try {
      await this.getConnection();
      let query = `insert into restaurants (restaurant_id, restaurant_name, restaurant_address, restaurant_latitude, restaurant_longitude, average_grade, posts_count, takeout, reservable, price_level, website, formatted_phone_number) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
      let results: any[];
      let fields: any;
      let params = [place_id, name, formatted_address, lat, lng, grade, 1, takeout, reservable, price_level, website, formatted_phone_number];
      [results, fields] = await this.connection.query(query, params);
      return [results, fields];
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }

  async deleteRestaurant(place_id: String) {
    try {
      await this.getConnection();
      let query = `DELETE FROM restaurants  WHERE restaurant_id = ?;`;
      let params = [place_id];
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query, params);
      return [results, fields];
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }

  async getRestaurantsDetail(restaurant_Ids: String[]) {
    try {
      if (restaurant_Ids.length < 1) {
        return [];
      }
      await this.getConnection();
      let query = `Select *, ${this.selectString} from restaurants Where restaurant_id in (?)`;
      let params = [restaurant_Ids];
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query, params);
      results.forEach((restaurant) => {
        this.translateBool(restaurant);
      });
      return results;
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }

  async getnearlocactionRestaurants(latitude: Number, longitude: Number, offset: Number, lastrestaurantid: String, limit: Number) {
    try {
      await this.getConnection();
      let query = `select *,
      ST_DISTANCE(POINT(restaurants.restaurant_longitude, restaurants.restaurant_latitude), POINT(?, ?)) AS distance,
      ${this.selectString}
      from restaurants 
      WHERE restaurants.restaurant_id IS NOT NULL AND ST_DISTANCE(POINT(restaurants.restaurant_longitude, restaurants.restaurant_latitude)
      POINT(?, ?))  > ?
      AND restaurants.restaurant_id != ?
      ORDER BY distance
      limit ?`;

      let params: any[];
      if (offset) {
        params = [longitude, latitude, longitude, latitude, offset, lastrestaurantid, limit];
      } else {
        params = [longitude, latitude, longitude, latitude, 0, "", limit];
      }
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query, params);

      for (const value of results) {
        this.translateBool(value);
      }
      return results;
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }
  async getAllTableRestaurants() {
    try {
      await this.getConnection();
      let query = `select * from restaurants;`;
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query);
      return results;
    } catch (error) {
      throw error;
    } finally {
      this.release();
    }
  }

  async updateAverageGrade(restaurant_id: String, averge_grade: Number) {
    try {
      await this.getConnection();
      let query = `update restaurants set average_grade = ? where restaurant_id = ?;`;
      let params = [averge_grade, restaurant_id];
      let results: any[];
      let fields: any;
      [results, fields] = await this.connection.query(query, params);
      return results;
    } catch (error) {
      throw error;
    }
  }
  async restaurantsearchfromgoogleByID(location_ID: String) {
    let result = await this.googleMapAPIService.searchPlaceByID(location_ID);
    return result;
  }

  translateBool(restaurant) {
    if (restaurant.reservable != null) {
      restaurant.reservable = restaurant.reservable == 1 ? true : false;
    }
    if (restaurant.takeout) {
      restaurant.takeout = restaurant.takeout == 1 ? true : false;
    }
  }
}

export default MySQLRestaurantsTableService;