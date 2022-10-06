import fastify from "fastify";
import senssible from "@fastify/sensible";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
dotenv.config();
const app = fastify();
app.register(senssible);
app.register(cookie, { secret: process.env.COOKIE_SECRET });
app.register(cors, { origin: process.env.CLIENT_URL, credentials: true });
/////////////////////////////////////////////////////we fake our loging
//this is the same thing using midleware in express
app.addHook("onRequest", (req, res, done) => {
  if (req.cookies.userId !== CURRENT_USER_ID) {
    req.cookies.userId = CURRENT_USER_ID;
    res.clearCookie("userId");
    res.setCookie("userId", CURRENT_USER_ID);
  }
  done();
});
///////////////////////////////////////////////////
const prisma = new PrismaClient();
//this line down here is faking the current logged in user
const CURRENT_USER_ID = (
  await prisma.user.findFirst({ where: { name: "Kyle" } })
).id;
const COMMENT_SELECT_FIELDS = {
  id: true,
  message: true,
  parentId: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
};
app.get("/posts", async (req, res) => {
  return await commitToDb(
    prisma.post.findMany({ select: { id: true, title: true } })
  );
});
app;
app.get("/posts/:id", async (req, res) => {
  return await commitToDb(
    prisma.post
      .findUnique({
        where: { id: req.params.id },
        select: {
          body: true,
          title: true,
          Comments: {
            orderBy: {
              createdAt: "desc",
            },
            select: {
              ...COMMENT_SELECT_FIELDS,
              _count: { select: { Likes: true } },
            },
          },
        },
      })
      .then(async (post) => {
        const likes = await prisma.Like.findMany({
          where: {
            userId: req.cookies.userId,
            commentId: { in: post.Comments.map((comment) => comment.id) },
          },
        });

        return {
          ...post,
          comments: post.Comments.map((comment) => {
            const { _count, ...commentFields } = comment;
            console.log(_count.Likes);
            return {
              ...commentFields,
              likedByMe: likes.find((like) => like.commentId === comment.id),
              likeCount: _count.Likes,
            };
          }),
        };
      })
  );
});

app.post("/posts/:id/comments", async (req, res) => {
  if (req.body.message === "" || req.body.message === null)
    return res.send(app.httpErrors.badRequest("Message is required"));
  return await commitToDb(
    prisma.comment
      .create({
        data: {
          message: req.body.message,
          userId: req.cookies.userId,
          parentId: req.body.parentId,
          postId: req.params.id,
        },
        select: COMMENT_SELECT_FIELDS,
      })
      .then((comment) => {
        return {
          ...comment,
          likeCount: 0,
          likedByMe: false,
        };
      })
  );
});
app.put("/posts/:postId/comments/:commentId", async (req, res) => {
  if (req.body.message === "" || req.body.message === null)
    return res.send(app.httpErrors.badRequest("Message is required"));
  const { userId } = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    select: { userId: true },
  });
  if (userId !== req.cookies.userId) {
    return res.send(
      app.httpErrors.unauthorized(
        "You do not have permission to edit this comment"
      )
    );
  }
  return await commitToDb(
    prisma.comment.update({
      where: { id: req.params.commentId },
      data: { message: req.body.message },
      select: { message: true },
    })
  );
});
app.delete("/posts/:postId/comments/:commentId", async (req, res) => {
  const { userId } = await prisma.comment.findUnique({
    where: { id: req.params.commentId },
    select: { userId: true },
  });
  if (userId !== req.cookies.userId) {
    return res.send(
      app.httpErrors.unauthorized(
        "You do not have permission to delete this comment"
      )
    );
  }
  return await commitToDb(
    prisma.comment.delete({
      where: { id: req.params.commentId },
      select: { id: true },
    })
  );
});
app.post("/posts/:postId/comments/:commentId/toggleLike", async (req, res) => {
  const data = {
    commentId: req.params.commentId,
    userId: req.cookies.userId,
  };
  const like = await prisma.Like.findUnique({
    where: { userId_commentId: data },
  });
  if (like == null) {
    return await commitToDb(prisma.Like.create({ data })).then(() => {
      return { addLike: true };
    });
  } else {
    return await commitToDb(
      prisma.Like.delete({ where: { userId_commentId: data } })
    ).then(() => {
      return { addLike: false };
    });
  }
});
async function commitToDb(promise) {
  const [error, data] = await app.to(promise);
  if (error) return app.httpErrors.internalServerError(error.message);
  return data;
}
app.listen({ port: process.env.PORT }, () =>
  console.log(`server is running on port ${process.env.PORT}`)
);
