const express = require("express");
const photoSchema = require("../schemas/photo");
const mongoose = require("mongoose");
const router = express.Router();

//앨범 목록 보내주기
router.get("/:id", async (req, res) => {
    try {
        const androidId = req.params.id;

        const customAlbums = await mongoose.model("photos", photoSchema, "photos").aggregate([
            {
                $match: { "userId": androidId, "album.type": "customAlbum"}
            }, {
                $group: { 
                    _id: {
                        type: "$album.type",
                        title: "$album.title",
                        thumbnail: "$album.thumbnail"
                    },
                } 
            }, {
                $sort: { "_id.title": 1 }
            }
        ]);
        //console.log(customAlbums);

        const dateAlbums = await mongoose.model("photos", photoSchema, "photos").aggregate([
            {
                $match: { "userId": androidId, "album.type": "dateAlbum" }
            }, {
                $group: { 
                    _id: {
                        type: "$album.type",
                        title: "$album.title",
                        thumbnail: "$album.thumbnail"
                    }
                } 
            }, {
                $sort: { "_id.title": -1 }
            }
        ]);
        //console.log(dateAlbums);

        let years = [];
        let yearAlbums = []; 
        let months = [];
        let monthAlbums = [];

        dateAlbums.forEach((e, i) => {
            let date = e._id.title.split("-");
            if(!years.includes(date[0])) {
                years.push(date[0]);
                yearAlbums.push({
                    title: date[0],
                    thumbnail: e._id.thumbnail
                });
            }
            if(!months.includes(date[0]+"-"+date[1])){
                months.push(date[0]+"-"+date[1]);
                monthAlbums.push({
                    title: date[0]+"-"+date[1],
                    thumbnail: e._id.thumbnail
                });
            }
            //console.log(yearAlbums, monthAlbums);

        });

        var resJson = {
            "customAlbums" : customAlbums,
            "dateAlbums" : dateAlbums,
            "yearAlbums" : yearAlbums,
            "monthAlbums" : monthAlbums
        };

        res.json(resJson);

    } catch (err) {
        console.error(err);
        res.status(500);
        res.json("ERROR");
    }
})

//해당 앨범의 페이지(사진들) 보내주기
router.get("/:title/:id", async (req, res) => {
    try{
        const androidId = req.params.id;
        console.log(req.params.title);

        const result = await mongoose.model("photos", photoSchema, "photos").find({
            userId: androidId,
            "album.title": { $regex : req.params.title },
        }).sort({
            "page.layoutOrder" : 1
        });
        console.log(result);
        res.json(result);

    } catch(err) {
        console.error(err);
        res.status(500);
        res.json({ "resJson" : "ERROR" });
    }
});

//받은 페이지(사진들) 저장하기
router.post("/:title/:id", async (req, res) => {
    try{
        const androidId = req.params.id;

        console.log(req.body);
        
        //사진들
        const album = req.body.album;
        const photos = req.body.photos;
        const deletedList = req.body.deletedList;

        var resJson = new Array();
        
        //앨범
        if(!album.thumbnail){
            album.thumbnail = photos[0].uri;
        }

        //사진 삭제
        for(idx in deletedList){
            await mongoose.model("photos", photoSchema, "photos").deleteOne({
                _id: deletedList._id,
            })
        }
        
        //사진 생성 및 수정
        for(idx in photos){
            console.log(idx, ": ", photos[idx]);
            const photo = photos[idx];
            var result;

            if(photo._id) { //수정
                result = await mongoose.model("photos", photoSchema, "photos").findOneAndUpdate({
                    _id: photo._id 
                }, {
                    $set: {
                        comment: photo.comment,
                        album: album,
                        page: photo.page,
                    }
                }, {
                    new: true
                });
            }
            else {  //생성
                var datetime; 
                try {   //날짜 예외처리
                    datetime = new Date(photo.datetime);
                    if (datetime == "Invalid Date") datetime = new Date();
                } catch (err) {
                    console.log(err);
                    datetime = new Date();
                };
                console.log(photo.tags);

                result = await mongoose.model("photos", photoSchema, "photos").create({
                    userId: photo.userId,
                    uri: photo.uri,
                    datetime: datetime,
                    location: photo.location,
                    comment: photo.comment,
                    tags: photo.tags,
                    album: album,
                    page: photo.page,
                });

                if(album.type == "customAlbum"){
                    let photoday = new Date(datetime);
                    let year = photoday.getFullYear();
                    let month =  ('0' + (photoday.getMonth() + 1)).slice(-2);
                    let day = ('0' + photoday.getDate()).slice(-2);
                    let dateAlbum_title = year + "-" + month + "-" + day;

                    //사진이 이미 달력앨범에 있는지 확인
                    const find_dateAlbum = await mongoose.model("photo", photoSchema, "photos").findOne({
                        userId: androidId,
                        uri: photo.uri,
                        "album.title": { $regex : dateAlbum_title },
                    });

                    if(find_dateAlbum == null){ //사진이 달력앨범에 없으면
                        //해당 날짜의 달력앨범이 있는지 확인
                        const dateAlbum_info = await mongoose.model("photo", photoSchema, "photos").findOne({
                            userId: androidId,
                            "album.title": { $regex : dateAlbum_title },
                            uri: photo.uri
                        }, { 
                            album: 1, page: 1 
                        }).sort({
                            "page.layoutOrder" : -1
                        });

                        if(dateAlbum_info == null){ //해당하는 달력앨범이 없으면 새로 앨범 만들기
                            var auto_dateAlbum = await mongoose.model("photos", photoSchema, "photos").create({
                                userId: photo.userId,
                                uri: photo.uri,
                                datetime: datetime,
                                location: photo.location,
                                comment: photo.comment,
                                tags: photo.tags,
                                "album.title": dateAlbum_title,
                                "album.type" : "dateAlbum",
                                "album.thumbnail" : photo.uri,
                                "page.pageOrder" : 1,
                                "page.layoutOrder": 0,
                            });
                        }
                        else {  //해당하는 달력앨범이 있으면 다음 순서에 이어서 저장
                            var auto_dateAlbum = await mongoose.model("photos", photoSchema, "photos").create({
                                userId: photo.userId,
                                uri: photo.uri,
                                datetime: datetime,
                                location: photo.location,
                                comment: photo.comment,
                                tags: photo.tags,
                                album: dateAlbum_info.album,
                                "page.pageOrder" : 1,
                                "page.layoutOrder": (dateAlbum_info.page.layoutOrder + 1),
                            });
                            
                        }
                    }
                }
            }
            console.log("result : ", result);
            resJson.push(result);
        };

        res.json({ "resJson": resJson });
    
    } catch(err) {
        console.log(err);
        res.status(500);
        res.json({ "resJson": "ERROR" });
    }
});

module.exports = router;
